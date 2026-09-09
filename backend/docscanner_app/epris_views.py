"""Tenant-scoped EPRIS purchase preparation and VMI CSV/attachment downloads."""
import io
import json
import zipfile
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from functools import lru_cache
import calendar

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CurrencyRate, ScannedDocument
from .services.epris_codes import (
    EU_NO_LT, country_currency, country_name, country_options,
    country_requires_subcodes, normalize_rows, validate_document, category_labels,
)
from .services.epris_report import (
    ATTACHMENT_LIMIT, attachment_name, attachment_content, claim_values, company_key, direction, duplicate_key,
    money, period_info, purchase_csv, refund_country, review_errors, automatic_country,
)


def fail(message):
    raise ValidationError({"error": message})


def selected_keys(data):
    keys = data.get("contractor_keys")
    if isinstance(keys, str):
        try:
            keys = json.loads(keys)
        except ValueError:
            fail("Netinkamas įmonės pasirinkimas")
    if not isinstance(keys, list) or not keys or len(keys) > 100 or any(not isinstance(k, str) or not k.strip() for k in keys):
        fail("Pasirinkite savo įmonę ir jos variantus")
    return set(keys)


def source_documents(user):
    return ScannedDocument.objects.filter(user=user, status__in=["completed", "exported"], is_archive_container=False).defer(
        "raw_text", "glued_raw_text", "gpt_raw_json", "structured_json", "enhanced_ocr_text", "matched_catalog_json",
    )


def candidates(user, keys, include_submitted=False):
    docs, counts = [], Counter()
    qs = source_documents(user)
    if not include_submitted:
        qs = qs.filter(epris_submitted_at__isnull=True)
    for doc in qs.order_by("invoice_date", "id").iterator():
        side = direction(doc, keys)
        counts[side] += 1
        if side != "pirkimas":
            continue
        country = refund_country(doc)
        if country not in EU_NO_LT:
            counts["not_foreign_eu_vat"] += 1
        elif not doc.invoice_date:
            counts["missing_date"] += 1
        elif not doc.vat_amount:
            counts["no_vat"] += 1
        else:
            docs.append(doc)
    return docs, dict(counts)


def exchange_rate(currency, on_date):
    row = CurrencyRate.objects.filter(currency=currency.upper(), date__lte=on_date).order_by("-date").first()
    return row.rate if row and row.rate and row.rate > 0 else None


def to_eur(amount, currency, on_date, rate_lookup=exchange_rate):
    if not currency:
        return None
    if currency.upper() == "EUR":
        return money(amount)
    rate = rate_lookup(currency, on_date)
    if rate is None:
        return None
    return money(money(amount) / Decimal(str(rate)))


def serialize(doc, convert=to_eur):
    claim = claim_values(doc)
    errors = review_errors(doc)
    eur = convert(doc.vat_amount, doc.currency, doc.invoice_date)
    deductible = convert(claim["deductible_vat"], doc.currency, doc.invoice_date) if claim["deductible_vat"] else None
    if eur is None:
        errors.append("Nėra valiutos kurso sumai eurais apskaičiuoti")
    taxable_eur = convert(doc.amount_wo_vat or 0, doc.currency, doc.invoice_date)
    fuel = any(r.get("code") == "1" for r in doc.epris_codes or [])
    threshold = 250 if fuel else 1000
    copy_check = taxable_eur is None or taxable_eur >= threshold
    has_file = bool(doc.file and doc.file.name)
    vat_prefix = (doc.seller_vat_code or "").replace(" ", "").upper()[:2]
    vat_country = "GR" if vat_prefix == "EL" else vat_prefix
    address_country = (doc.seller_country_iso or "").strip().upper()
    address_country = "GR" if address_country == "EL" else address_country
    country_notice = ""
    if vat_prefix.isalpha() and address_country and vat_country != address_country:
        country_notice = (f"Tiekėjo PVM kodo prefiksas {vat_prefix} nesutampa su tiekėjo šalimi {address_country}. "
                          f"Patikrinkite rekvizitus. Grąžinimo šalis: {claim['refund_country']}.")
    return {
        "id": doc.id, "invoice_date": doc.invoice_date.isoformat() if doc.invoice_date else None,
        **{k: getattr(doc, k) or "" for k in (
            "document_number", "document_series", "seller_name", "seller_id", "seller_address", "seller_vat_code",
            "seller_country_iso", "buyer_name", "buyer_vat_code", "preview_url",
        )},
        "direction": "pirkimas", "currency": claim["currency"],
        "amount_wo_vat": claim["taxable_amount"], "vat_amount": claim["vat_amount"],
        "vat_percent": str(doc.vat_percent) if getattr(doc, "vat_percent", None) is not None else None,
        "separate_vat": getattr(doc, "separate_vat", False) is True,
        "category_labels": category_labels(doc.epris_codes),
        "supplier_country_notice": country_notice,
        "vat_eur": str(eur) if eur is not None else None,
        "deductible_eur": str(deductible) if deductible is not None else None,
        "epris_details": claim, "epris_codes": doc.epris_codes or [],
        "epris_status": "tikrinti" if errors else "tinkama", "warnings": errors,
        "epris_submitted_at": doc.epris_submitted_at.isoformat() if doc.epris_submitted_at else None,
        "attachment": {"available": has_file, "supported": has_file and bool(attachment_name(doc, 1)),
                       "check_required": copy_check, "threshold_eur": threshold},
    }


def serialize_many(docs):
    # Cache rates only within this request, including missing rates.
    rates = lru_cache(maxsize=2048)(exchange_rate)
    def convert(amount, currency, on_date):
        return to_eur(amount, currency, on_date, rates)
    duplicate_counts = Counter(duplicate_key(d) for d in docs)
    return [{**serialize(d, convert), "notices": ["Galimas dublikatas – eksportui pasirinkite tik vieną kopiją."] if duplicate_counts[duplicate_key(d)] > 1 else []} for d in docs]


def request_period(data):
    country = data.get("country", "")
    if not isinstance(country, str) or country not in EU_NO_LT:
        fail("Pasirinkite kitą ES valstybę")
    try:
        info = period_info(data.get("date_from"), data.get("date_to"), data.get("year_remainder") is True)
    except ValueError as exc:
        fail(str(exc))
    return country, info


def period_documents(user, data):
    keys = selected_keys(data)
    country, info = request_period(data)
    docs, counts = candidates(user, keys, data.get("include_submitted") is True)
    docs = [d for d in docs if refund_country(d) == country and data["date_from"] <= d.invoice_date.isoformat() <= data["date_to"]]
    return docs, counts, info


class EprisContractorSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        search = (request.query_params.get("q") or "").strip().lower()
        merged = {}
        # Include both invoice parties and all observed names for a stable OSS-style key.
        fields = [f"{side}_{field}" for side in ("buyer", "seller") for field in ("name", "vat_code", "id")]
        for row in source_documents(request.user).values(*fields).iterator():
            for side in ("buyer", "seller"):
                name, vat, code = (row[f"{side}_{f}"] or "" for f in ("name", "vat_code", "id"))
                key = company_key(name, vat, code)
                if not key:
                    continue
                item = merged.setdefault(key, {"key": key, "display_name": name or vat or code, "vat": vat, "code": code, "count": 0, "purchase_count": 0, "variants": []})
                item["count"] += 1
                item["purchase_count"] += side == "buyer"
                label = " · ".join(filter(None, (name, vat, code)))
                if label not in item["variants"]:
                    item["variants"].append(label)
        items = [v for v in merged.values() if not search or search in " ".join(v["variants"]).lower()]
        return Response(sorted(items, key=lambda v: (-v["purchase_count"], -v["count"]))[:50])


class EprisCodeOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        country = request.query_params.get("country", "").upper()
        if country not in EU_NO_LT:
            fail("Pasirinkite kitą ES valstybę")
        return Response({"country": country, "country_name": country_name(country),
                         "requires_subcodes": country_requires_subcodes(country), "categories": country_options(country)})


class EprisDocumentCodesView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        keys = selected_keys(request.data)
        doc = source_documents(request.user).filter(pk=pk).first()
        if doc is None:
            return Response({"error": "Dokumentas nerastas"}, status=404)
        if direction(doc, keys) != "pirkimas":
            fail("Dokumentas nėra pasirinktos įmonės pirkimas")
        try:
            rows = normalize_rows(request.data.get("codes", []))
            details = request.data.get("details", {})
            if not isinstance(details, dict):
                raise ValueError("Netinkami PVM duomenys")
            country = details.get("refund_country", refund_country(doc))
            if not isinstance(country, str) or country not in EU_NO_LT:
                raise ValueError("Netinkama grąžinimo šalis")
            defaults = claim_values(doc)
            rate = money(details.get("prorata_rate") or defaults["prorata_rate"])
            if not 0 < rate <= 100 or rate != rate.to_integral_value():
                raise ValueError("Veiklos atskaitos koeficientas turi būti sveikasis procentas (1–100)")
            vat = money(doc.vat_amount or 0)
            percent = money(details.get("deduction_percent", defaults["deduction_percent"]))
            if not 0 <= percent <= 100:
                raise ValueError("Atskaitos procentas turi būti nuo 0 iki 100")
            automatic_amount = money(vat * percent / 100)
            amount = details.get("deductible_vat", automatic_amount if "deduction_percent" in details else defaults["deductible_vat"])
            amount = automatic_amount if amount in (None, "") else money(amount)
            if amount < 0 or amount > money(vat * rate / 100):
                raise ValueError("Grąžintinas PVM viršija sąskaitos PVM pagal atskaitos procentą")
            if vat > 0 and ("deduction_percent" not in details or amount != automatic_amount):
                percent = money(amount / vat * 100)
            parsed = {"prorata_rate": str(rate), "deduction_percent": str(percent)}
            if country != automatic_country(doc):
                parsed["refund_country"] = country
            if amount != money(vat * percent / 100):
                parsed["deductible_vat"] = str(amount)
            simplified = details.get("simplified_invoice", defaults["simplified_invoice"])
            if not isinstance(simplified, bool):
                raise ValueError("Netinkamas sąskaitos tipas")
            parsed["simplified_invoice"] = simplified
        except ValueError as exc:
            fail(str(exc))
        errors = validate_document(country, rows) if rows else []
        if errors:
            return Response({"error": "; ".join(errors), "errors": errors}, status=400)
        doc.epris_codes, doc.epris_details = rows, parsed
        doc.epris_status = "tikrinti" if review_errors(doc) else "tinkama"
        doc.save(update_fields=["epris_codes", "epris_details", "epris_status"])
        return Response(serialize(doc))


class EprisOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        docs, counts = candidates(request.user, selected_keys(request.query_params), request.query_params.get("include_submitted") == "1")
        buckets = {}
        for doc, e in zip(docs, serialize_many(docs)):
            country, year = refund_country(doc), doc.invoice_date.year
            b = buckets.setdefault((country, year), {"vat": Decimal(0), "ready_vat": Decimal(0), "docs": 0, "ready": 0, "unknown": 0, "quarters": defaultdict(lambda: Decimal(0))})
            b["docs"] += 1
            b["unknown"] += e["vat_eur"] is None
            b["vat"] += Decimal(e["vat_eur"] or 0)
            if e["epris_status"] == "tinkama":
                b["ready"] += 1
                b["ready_vat"] += Decimal(e["deductible_eur"] or 0)
                b["quarters"][(doc.invoice_date.month - 1) // 3 + 1] += Decimal(e["deductible_eur"] or 0)
            else:
                b["quarters"][(doc.invoice_date.month - 1) // 3 + 1] += 0
        rows = []
        for (country, year), b in buckets.items():
            quarters = [{"quarter": q, "vat_eur": str(v), "eligible": v >= 400 and date(year, q * 3, calendar.monthrange(year, q * 3)[1]) < date.today()} for q, v in sorted(b["quarters"].items())]
            rows.append({"country": country, "country_name": country_name(country), "year": year,
                         "currency": country_currency(country, date(year, 12, 31)), "vat_eur": str(b["vat"]),
                         "ready_vat_eur": str(b["ready_vat"]), "doc_count": b["docs"], "ready_count": b["ready"],
                         "unknown_rate_count": b["unknown"], "quarters": quarters,
                         "annual_eligible": year < date.today().year and b["ready_vat"] >= 50,
                         "quarterly_eligible": any(q["eligible"] for q in quarters),
                         "deadline_ok": date.today() <= date(year + 1, 9, 30), "deadline": f"{year + 1}-09-30"})
        return Response({"rows": sorted(rows, key=lambda r: (-r["year"], r["country"])), "direction_counts": counts})


class EprisDocumentsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        docs, counts, info = period_documents(request.user, request.data)
        try:
            offset, limit = int(request.data.get("offset", 0)), int(request.data.get("limit", 100))
            if offset < 0 or not 1 <= limit <= 500:
                raise ValueError()
        except (ValueError, TypeError):
            fail("Netinkamos puslapiavimo reikšmės")
        entries = serialize_many(docs)
        total = sum((Decimal(e["deductible_eur"] or 0) for e in entries if e["epris_status"] == "tinkama"), Decimal(0))
        return Response({"country": request.data["country"], "country_name": country_name(request.data["country"]),
                         "currency": country_currency(request.data["country"], date.fromisoformat(request.data["date_to"])),
                         "total_count": len(entries), "ready_count": sum(e["epris_status"] == "tinkama" for e in entries),
                         "total_vat_eur": str(total), "threshold_met": total >= Decimal(info["threshold"]),
                         "same_year": True, **info, "direction_counts": counts, "entries": entries[offset:offset + limit]})


class EprisExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        docs, _, info = period_documents(request.user, request.data)
        ids = request.data.get("document_ids")
        if not isinstance(ids, list) or not ids or any(type(i) is not int for i in ids) or len(set(ids)) != len(ids):
            fail("Pasirinkite konkrečius dokumentus eksportui")
        docs = [d for d in docs if d.id in set(ids)]
        if len(docs) != len(ids):
            fail("Dalis dokumentų neatitinka įmonės, šalies arba laikotarpio")
        if len({duplicate_key(d) for d in docs}) != len(docs):
            fail("Pasirinktos kelios tos pačios sąskaitos kopijos. Palikite tik vieną.")
        entries = serialize_many(docs)
        issues = [f"{e['document_number'] or e['id']}: {'; '.join(e['warnings'])}" for e in entries if e["warnings"]]
        if issues:
            fail(" | ".join(issues))
        if info["period_errors"]:
            fail("; ".join(info["period_errors"]))
        total = sum((Decimal(e["deductible_eur"] or 0) for e in entries), Decimal(0))
        if total < Decimal(info["threshold"]):
            fail(f"Pasirinktas grąžintinas PVM {total} EUR nesiekia {info['threshold']} EUR ribos")
        output_format = request.data.get("format", "csv")
        stem = f"EPRIS_{request.data['country']}_{request.data['date_from']}_{request.data['date_to']}"
        if output_format == "csv":
            content, mime, name = purchase_csv(docs), "text/csv; charset=utf-8", stem + ".csv"
            ScannedDocument.objects.filter(id__in=[d.id for d in docs]).update(epris_submitted_at=timezone.now())
        elif output_format == "attachments":
            buf, total_bytes = io.BytesIO(), 0
            with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for i, doc in enumerate(docs, 1):
                    name = attachment_name(doc, i) if doc.file else None
                    if not name:
                        fail(f"{doc.document_number}: nėra PDF, JPEG ar TIFF originalo. Paruoškite kopiją atskirai.")
                    try:
                        content = attachment_content(doc)
                    except (OSError, ValueError) as exc:
                        fail(f"{doc.document_number}: {exc}")
                    total_bytes += len(content)
                    if total_bytes > ATTACHMENT_LIMIT:
                        fail("Kopijos viršija 5 MB. Sumažinkite failus arba paruoškite priedus atskirai; prašymui taip pat reikia vietos.")
                    archive.writestr(name, content)
            content = buf.getvalue()
            if len(content) >= ATTACHMENT_LIMIT:
                fail("Priedų archyvas viršija 5 MB; sumažinkite kopijas")
            mime, name = "application/zip", stem + "_priedai.zip"
        else:
            fail("Nežinomas eksporto formatas")
        # CSV download marks the documents as exported so they are not claimed twice.
        response = HttpResponse(content, content_type=mime)
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        return response
