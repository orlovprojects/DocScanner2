"""
InvoiceExportAdapter — обёртка над Invoice,
делающая его duck-type совместимым с ScannedDocument
для всех существующих экспортёров.

Использование:
    from docscanner_app.utils.invoice_export_adapter import adapt_invoices_for_export

    adapted = adapt_invoices_for_export(invoices_qs, user)
    # adapted — список объектов, совместимых с ScannedDocument
    # можно передавать в export_*_group_to_*() функции
"""

from __future__ import annotations

import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from django.db.models import QuerySet

logger = logging.getLogger("docscanner_app")

# Маппинг InvoiceLineItem.preke_paslauga → int для auto_select_pvm_code
_PP_MAP = {"preke": 1, "paslauga": 2}


# ──────────────────────────────────────────────
# Adapter для InvoiceLineItem → LineItem interface
# ──────────────────────────────────────────────

class InvoiceLineItemAdapter:
    """
    Обёртка над InvoiceLineItem.
    Экспортёры обращаются к line item через getattr —
    все поля InvoiceLineItem уже совпадают с LineItem,
    поэтому проксируем напрямую, с fallback-ами для
    vat_percent / vat / total / price / subtotal / pvm_kodas.
    """

    def __init__(self, line_item, doc_adapter: "InvoiceExportAdapter"):
        self._li = line_item
        self._doc = doc_adapter

    def __getattr__(self, name):
        if name == "id":
            return self._li.pk

        if name == "product_name":
            return self._li.prekes_pavadinimas or ""
        if name == "product_code":
            return self.prekes_kodas  # делегируем на prekes_kodas с fallback

        # ── prekes_kodas: fallback на barkodas → random ──
        if name == "prekes_kodas":
            val = self._li.prekes_kodas
            if val:
                return val
            bar = self._li.prekes_barkodas
            if bar:
                return bar
            import random, string
            code = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
            self._li.prekes_kodas = code
            try:
                self._li.save(update_fields=["prekes_kodas"])
            except Exception:
                pass
            return code

        # ── pvm_kodas: из _pvm_line_map адаптера ──
        if name == "pvm_kodas":
            val = self._li.pvm_kodas
            if val:
                return val
            pvm_map = self._doc._pvm_line_map
            if pvm_map and self._li.pk in pvm_map:
                return pvm_map[self._li.pk]
            return ""

        # ── price: скорректированная после всех скидок ──
        # В Invoice subtotal уже после строковой скидки, price — оригинальная.
        # Если есть документная скидка — _adjusted_lines содержит пересчитанные.
        # Экспортёры считают subtotal = price × qty.
        if name == "price":
            adj = self._doc._adjusted_lines.get(self._li.pk)
            if adj:
                return adj["price"]
            # Нет документной скидки — проверяем строковую
            discount = self._li.discount_wo_vat
            if discount and Decimal(str(discount or 0)) > 0:
                subtotal = Decimal(str(self._li.subtotal or 0))
                qty = Decimal(str(self._li.quantity or 1))
                if qty > 0:
                    return (subtotal / qty).quantize(
                        Decimal("0.0001"), rounding=ROUND_HALF_UP
                    )
            return self._li.price

        # ── subtotal: скорректированный после всех скидок ──
        if name == "subtotal":
            adj = self._doc._adjusted_lines.get(self._li.pk)
            if adj:
                return adj["subtotal"]
            return self._li.subtotal

        # ── скидки строки: уже в subtotal/price, обнуляем ──
        if name in ("discount_wo_vat", "discount_with_vat"):
            return Decimal("0")

        # ── vat_percent: fallback на документный при taikoma+!separate ──
        if name == "vat_percent":
            val = self._li.vat_percent
            if val is not None:
                return val
            inv = self._doc._invoice
            if (inv.pvm_tipas or "taikoma") == "netaikoma":
                return Decimal("0")
            if not inv.separate_vat:
                return inv.vat_percent if inv.vat_percent is not None else Decimal("0")
            return Decimal("0")

        # ── vat: пересчёт если None ──
        if name == "vat":
            val = self._li.vat
            if val is not None:
                # Если subtotal скорректирован — пересчитываем vat тоже
                adj = self._doc._adjusted_lines.get(self._li.pk)
                if adj:
                    vat_pct = self.vat_percent
                    if vat_pct:
                        return (adj["subtotal"] * Decimal(str(vat_pct)) / Decimal("100")).quantize(
                            Decimal("0.01"), rounding=ROUND_HALF_UP
                        )
                return val
            inv = self._doc._invoice
            if (inv.pvm_tipas or "taikoma") == "netaikoma":
                return Decimal("0")
            subtotal = Decimal(str(self.subtotal or 0))
            vat_pct = self.vat_percent
            if subtotal and vat_pct:
                return (
                    Decimal(str(subtotal)) * Decimal(str(vat_pct)) / Decimal("100")
                ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            return Decimal("0")

        # ── total: пересчёт если None или adjusted ──
        if name == "total":
            adj = self._doc._adjusted_lines.get(self._li.pk)
            if adj:
                subtotal = adj["subtotal"]
                vat = self.vat
                return (Decimal(str(subtotal)) + Decimal(str(vat))).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
            val = self._li.total
            if val is not None:
                return val
            subtotal = Decimal(str(self.subtotal or 0))
            vat = self.vat
            return (Decimal(str(subtotal)) + Decimal(str(vat))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        # Всё остальное — напрямую с InvoiceLineItem
        val = getattr(self._li, name, None)
        return val

    def get(self, key, default=None):
        """Некоторые экспортёры используют dict-like .get()"""
        return getattr(self, key, default)


# ──────────────────────────────────────────────
# Adapter для Invoice → ScannedDocument interface
# ──────────────────────────────────────────────

class InvoiceExportAdapter:
    """
    Обёртка над Invoice, предоставляющая тот же интерфейс
    что и ScannedDocument для экспортёров.
    """

    def __init__(self, invoice, user=None):
        self._invoice = invoice
        self._user = user or invoice.user
        self._line_items_cache = None

        # --- Базовые поля ---
        self.pirkimas_pardavimas = "pardavimas"

        # --- Рассчитываем pvm_kodas для каждой строки ---
        pvm_tipas = invoice.pvm_tipas or "taikoma"
        doc_vat_pct = invoice.vat_percent  # Decimal или None

        line_items_raw = self._get_raw_line_items()
        pvm_map = {}  # {line_item_pk: pvm_kodas}

        if pvm_tipas == "taikoma" and line_items_raw:
            from docscanner_app.validators.vat_klas import auto_select_pvm_code

            buyer_iso = invoice.buyer_country_iso or None
            seller_iso = invoice.seller_country_iso or None
            buyer_has_vat = bool(invoice.buyer_vat_code)
            seller_has_vat = bool(invoice.seller_vat_code)
            is_96_str = bool(invoice.doc_96_str)

            for li in line_items_raw:
                if li.pvm_kodas:
                    pvm_map[li.pk] = li.pvm_kodas
                    continue

                line_vat = li.vat_percent if li.vat_percent is not None else doc_vat_pct

                if line_vat is None:
                    continue

                pp_int = _PP_MAP.get((li.preke_paslauga or "").strip().lower())

                code = auto_select_pvm_code(
                    pirkimas_pardavimas="pardavimas",
                    buyer_country_iso=buyer_iso,
                    seller_country_iso=seller_iso,
                    preke_paslauga=pp_int,
                    vat_percent=float(line_vat),
                    separate_vat=False,
                    buyer_has_vat_code=buyer_has_vat,
                    seller_has_vat_code=seller_has_vat,
                    doc_96_str=is_96_str,
                )

                if code:
                    pvm_map[li.pk] = code

            logger.debug(
                "[InvAdapter] invoice=%s pvm_tipas=%s "
                "doc_vat_pct=%s pvm_map=%s",
                invoice.pk, pvm_tipas, doc_vat_pct, pvm_map,
            )

        # Document-level pvm_kodas
        if invoice.pvm_kodas:
            self.pvm_kodas = invoice.pvm_kodas
        elif pvm_map:
            codes = set(pvm_map.values())
            if len(codes) == 1:
                self.pvm_kodas = codes.pop()
            else:
                self.pvm_kodas = "Keli skirtingi PVM"
        else:
            self.pvm_kodas = None

        # None если пустой → экспортёр пойдёт в fallback li["pvm_kodas"]
        self._pvm_line_map = pvm_map if pvm_map else None

        # --- Предрассчёт скорректированных сумм строк ---
        # subtotal строк уже после строковых скидок.
        # invoice_discount_wo_vat тоже уже вычтен из amount_wo_vat.
        # Распределяем документную скидку на строки пропорционально.
        self._adjusted_lines = {}  # {li.pk: {"price": Decimal, "subtotal": Decimal}}

        doc_discount = Decimal(str(invoice.invoice_discount_wo_vat or 0))
        if doc_discount > 0 and line_items_raw:
            sum_subtotals = sum(
                Decimal(str(li.subtotal or 0)) for li in line_items_raw
            )
            if sum_subtotals > 0:
                distributed = Decimal("0")
                for i, li in enumerate(line_items_raw):
                    li_subtotal = Decimal(str(li.subtotal or 0))
                    li_qty = Decimal(str(li.quantity or 1))

                    if i == len(line_items_raw) - 1:
                        line_disc = doc_discount - distributed
                    else:
                        share = li_subtotal / sum_subtotals
                        line_disc = (doc_discount * share).quantize(
                            Decimal("0.01"), rounding=ROUND_HALF_UP
                        )
                        distributed += line_disc

                    new_subtotal = (li_subtotal - line_disc).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                    new_price = (
                        (new_subtotal / li_qty).quantize(
                            Decimal("0.0001"), rounding=ROUND_HALF_UP
                        )
                        if li_qty > 0 else Decimal("0")
                    )

                    self._adjusted_lines[li.pk] = {
                        "price": new_price,
                        "subtotal": new_subtotal,
                    }

                logger.debug(
                    "[InvAdapter] invoice=%s doc_discount=%s adjusted_lines=%s",
                    invoice.pk, doc_discount,
                    {k: str(v) for k, v in self._adjusted_lines.items()},
                )

    # --- Core identity ---

    @property
    def pk(self):
        return self._invoice.pk

    @property
    def id(self):
        return self._invoice.pk

    # --- Document number ---

    @property
    def document_number(self):
        return self._invoice.full_number

    @property
    def document_series(self):
        return self._invoice.document_series or ""

    # --- Document type ---

    @property
    def document_type(self):
        return self._invoice.get_invoice_type_display()

    @property
    def document_type_code(self):
        mapping = {
            "pvm_saskaita": "SF",
            "saskaita": "SF",
            "isankstine": "ISF",
            "kreditine": "KSF",
        }
        return self._invoice.document_type_code or mapping.get(
            self._invoice.invoice_type, "SF"
        )

    # --- Даты ---

    @property
    def invoice_date(self):
        return self._invoice.invoice_date

    @property
    def due_date(self):
        return self._invoice.due_date

    @property
    def operation_date(self):
        return self._invoice.operation_date

    @property
    def uploaded_at(self):
        return self._invoice.created_at

    # --- Scan type ---

    @property
    def scan_type(self):
        return "detaliai"

    # --- Validation flags ---

    @property
    def ready_for_export(self):
        return True

    @property
    def math_validation_passed(self):
        return True

    @property
    def status(self):
        return self._invoice.status

    @property
    def separate_vat(self):
        """
        Если на Invoice explicitly задано — используем.
        Если None — автодетект: разные vat_percent на строках → True.
        """
        val = self._invoice.separate_vat
        if val is not None:
            return bool(val)
        rates = set()
        for li in self._get_raw_line_items():
            if li.vat_percent is not None:
                rates.add(li.vat_percent)
        return len(rates) > 1

    @property
    def invoice_discount_wo_vat(self):
        """Скидка уже применена в amount_wo_vat и распределена
        на строки через _adjusted_lines. Обнуляем чтобы
        экспортёры не применили повторно."""
        return Decimal("0")

    @property
    def invoice_discount_with_vat(self):
        return Decimal("0")

    @property
    def report_to_isaf(self):
        if self._invoice.report_to_isaf is not None:
            return self._invoice.report_to_isaf
        return (self._invoice.pvm_tipas or "taikoma") == "taikoma"

    # --- File-related ---

    @property
    def preview_url(self):
        if self._invoice.public_link_enabled and self._invoice.uuid:
            return f"https://saskaituisrasymas.lt/sf/{self._invoice.uuid}"
        return ""

    @property
    def file(self):
        return self._invoice.pdf_file

    @property
    def original_filename(self):
        if self._invoice.pdf_file:
            return self._invoice.pdf_file.name
        return f"invoice_{self._invoice.full_number}.pdf"

    # --- Line items ---

    def _get_raw_line_items(self):
        if self._line_items_cache is not None:
            return self._line_items_cache
        try:
            items = list(self._invoice.line_items.all())
            self._line_items_cache = items
            return items
        except Exception:
            return []

    class _LineItemManager:
        def __init__(self, adapter: "InvoiceExportAdapter"):
            self._adapter = adapter

        def all(self):
            return [
                InvoiceLineItemAdapter(li, self._adapter)
                for li in self._adapter._get_raw_line_items()
            ]

        def exists(self):
            return len(self._adapter._get_raw_line_items()) > 0

        def count(self):
            return len(self._adapter._get_raw_line_items())

        def filter(self, **kwargs):
            return self.all()

        def __iter__(self):
            return iter(self.all())

        def __len__(self):
            return self.count()

    @property
    def line_items(self):
        return self._LineItemManager(self)

    # --- Extra fields fallback ---

    def _get_user_defaults_for_field(self, field_name: str):
        sales_defaults = getattr(self._user, "sales_defaults", None) or []
        for item in sales_defaults:
            if isinstance(item, dict):
                if item.get("key") == field_name or item.get("field") == field_name:
                    return item.get("value", "")
        return None

    # --- Catch-all ---

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)

        val = getattr(self._invoice, name, None)

        if not val and name.endswith(("_kodas", "_pavadinimas")):
            user_val = self._get_user_defaults_for_field(name)
            if user_val:
                return user_val

        return val if val is not None else ""

    def __str__(self):
        return f"InvoiceAdapter({self._invoice})"


# ──────────────────────────────────────────────
# Convenience function
# ──────────────────────────────────────────────

def adapt_invoices_for_export(invoices, user=None) -> list[InvoiceExportAdapter]:
    return [InvoiceExportAdapter(inv, user=user) for inv in invoices]