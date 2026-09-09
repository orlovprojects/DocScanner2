"""Regression checks without a database or network.

Run with the project's Django settings initialized, via unittest.
"""
import csv
import io
import unittest
import zipfile
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from rest_framework.test import APIRequestFactory, force_authenticate
from . import epris_views as views
from .services.epris_codes import country_currency, normalize_rows, validate_document
from .services.epris_report import (
    attachment_name, attachment_content, company_key, direction, money, period_info, purchase_csv,
    refund_country, review_errors,
)


def invoice(**changes):
    doc = SimpleNamespace(
        id=1, buyer_id="123", buyer_name="Mano UAB", buyer_vat_code="LT123",
        seller_id="987", seller_name="Hotel GmbH", seller_vat_code="DE123456789",
        seller_address="Berlin, Strasse 1", seller_country_iso="DE", invoice_date=date(2025, 5, 1),
        document_series="A", document_number="42", currency="EUR", amount_wo_vat=Decimal("1000"),
        vat_amount=Decimal("200"), doc_96_str=False, is_credit_invoice=False,
        math_validation_passed=True, preview_url="", file=None, epris_submitted_at=None,
        pirkimas_pardavimas="pardavimas",  # The old generic direction must be ignored.
        epris_codes=[{"code": "6", "subcode": "", "free_text": "", "language": ""}],
        epris_details={"refund_country": "DE", "deductible_vat": "100.00", "prorata_rate": "50.00", "confirmed": True, "simplified_invoice": False},
    )
    doc.__dict__.update(changes)
    return doc


class EprisRulesTests(unittest.TestCase):
    def test_company_direction_ignores_generic_flag(self):
        doc = invoice()
        self.assertEqual(direction(doc, {"id:123"}), "pirkimas")
        self.assertEqual(direction(doc, {"id:987"}), "pardavimas")
        self.assertEqual(direction(doc, {"id:123", "id:987"}), "ambiguous")
        self.assertEqual(direction(doc, {"another"}), "unmatched")

    def test_variants_use_oss_key_precedence(self):
        self.assertEqual(company_key("Renamed UAB", "LT999", " 123 "), "id:123")
        self.assertEqual(company_key("Mano UAB", "LT999", ""), "lt999")
        self.assertEqual(company_key(" Mano UAB ", "", ""), "mano uab")
        self.assertEqual(company_key(" Mano UAB ", "  ", ""), "mano uab")

    def test_refund_country_uses_tax_registration_not_supplier_address(self):
        self.assertEqual(refund_country(invoice(epris_details={}, seller_country_iso="FR")), "DE")
        self.assertEqual(refund_country(invoice(epris_details={}, seller_vat_code="LT999")), "LT")
        self.assertEqual(refund_country(invoice(epris_details={}, seller_vat_code="EL999")), "GR")

    def test_periods_and_year_remainder(self):
        now = date(2026, 9, 7)
        self.assertEqual(period_info("2025-01-01", "2025-12-31", today=now)["threshold"], "50")
        self.assertEqual(period_info("2025-10-01", "2025-12-31", today=now)["threshold"], "400")
        self.assertEqual(period_info("2025-11-01", "2025-12-31", True, now)["threshold"], "50")
        for start, end in [("2025-12-01", "2026-02-28"), ("2025-01-02", "2025-03-31"), ("bad", "2025-03-31"), ("2025-11-01", "2025-12-31")]:
            with self.subTest(start=start), self.assertRaises(ValueError):
                period_info(start, end, today=now)

    def test_deadline_and_unfinished_period(self):
        self.assertFalse(period_info("2025-01-01", "2025-12-31", today=date(2026, 9, 30))["deadline_passed"])
        expired = period_info("2025-01-01", "2025-12-31", today=date(2026, 10, 1))
        self.assertTrue(expired["deadline_passed"])
        self.assertEqual(expired["deadline"], "2026-09-30")
        self.assertFalse(expired["period_errors"])
        self.assertTrue(period_info("2026-01-01", "2026-12-31", today=date(2026, 9, 7))["period_errors"])

    def test_country_currency_is_historical(self):
        self.assertEqual(country_currency("BG", date(2025, 12, 31)), "BGN")
        self.assertEqual(country_currency("BG", date(2026, 1, 1)), "EUR")
        self.assertEqual(country_currency("HR", date(2022, 1, 1)), "HRK")

    def test_review_valid_partial_claim_without_confirmation(self):
        doc = invoice()
        self.assertEqual(review_errors(doc), [])

    def test_category_only_uses_document_defaults(self):
        from .services.epris_report import claim_values
        doc = invoice(epris_details={})
        self.assertEqual(review_errors(doc), [])
        self.assertEqual(claim_values(doc)["deductible_vat"], "200.00")
        self.assertEqual(claim_values(doc)["prorata_rate"], "100.00")
        doc.vat_amount = Decimal("250")
        self.assertEqual(claim_values(doc)["deductible_vat"], "250.00")
        self.assertNotIn("confirmed", claim_values(doc))
        self.assertEqual(review_errors(doc), [])

    def test_manual_percentage_keeps_automatic_amount(self):
        from .services.epris_report import claim_values
        doc = invoice(epris_details={"prorata_rate": "50.00"})
        self.assertEqual(claim_values(doc)["deductible_vat"], "100.00")
        doc.vat_amount = Decimal("300")
        self.assertEqual(claim_values(doc)["deductible_vat"], "150.00")

    def test_review_blocks_invalid_claims(self):
        for changes in [dict(doc_96_str=True), dict(is_credit_invoice=True), dict(seller_address=""), dict(currency="USD"), dict(math_validation_passed=False), dict(document_number=""), dict(seller_vat_code="LT123")]:
            with self.subTest(changes=changes):
                self.assertTrue(review_errors(invoice(**changes)))
        for value in ["201", "-1", "NaN", "Infinity"]:
            doc = invoice()
            doc.epris_details["deductible_vat"] = value
            self.assertTrue(review_errors(doc))

    def test_money_rejects_non_finite_and_accepts_comma(self):
        self.assertEqual(money("12,34"), Decimal("12.34"))
        for value in ["NaN", "Infinity", "x", None]:
            with self.assertRaises(ValueError):
                money(value)

    def test_code_validation_language_and_description(self):
        with self.assertRaises(ValueError):
            normalize_rows({"code": "1"})
        self.assertTrue(validate_document("DE", [{"code": "10", "free_text": "Office", "language": "XX"}]))
        self.assertTrue(validate_document("DE", [{"code": "10", "free_text": "", "language": ""}]))

    def test_csv_vmi_schema_partial_deduction_and_parent_link(self):
        doc = invoice(seller_name='Hotel; "A"')
        rows = list(csv.reader(io.StringIO(purchase_csv([doc]).decode("utf-8")), delimiter=";"))
        row = dict(zip(rows[1], rows[2]))
        self.assertEqual(len(rows[1]), 20)
        self.assertEqual(len(rows[2]), 20)
        self.assertEqual(row["VT_VATIDENTIFICATIONNUMB"], "123456789")
        self.assertEqual(row["VT_NAMEFREE"], doc.seller_name)
        self.assertEqual(row["VI_DEDUCTIBLEVATAMOUNT"], "100,00")
        self.assertEqual(row["VI_PRORATARATE"], "50")
        self.assertEqual(row["VI_CURRENCY_VAT"], "EUR")
        self.assertEqual(row["VI_CURRENCY_DVAT"], "EUR")
        self.assertEqual(rows[-1][0], row["PARENT_ID"])
        self.assertFalse(purchase_csv([doc]).startswith(b"\xef\xbb\xbf"))

    def test_full_activity_deduction_is_omitted_from_csv(self):
        doc = invoice(epris_details={"deduction_percent": "33.33", "deductible_vat": "66.67"})
        rows = list(csv.reader(io.StringIO(purchase_csv([doc]).decode()), delimiter=";"))
        row = dict(zip(rows[1], rows[2]))
        self.assertEqual(row["VI_PRORATARATE"], "")
        self.assertEqual(row["VI_DEDUCTIBLEVATAMOUNT"], "66,67")
        self.assertEqual(review_errors(doc), [])

    def test_fractional_activity_coefficient_requires_correction(self):
        self.assertTrue(review_errors(invoice(epris_details={"prorata_rate": "50.55"})))

    def test_preview_requisites_rates_and_country_notice(self):
        doc = invoice(seller_country_iso="FR", vat_percent=Decimal("20"), separate_vat=True)
        entry = views.serialize(doc)
        self.assertEqual(entry["seller_id"], "987")
        self.assertEqual(entry["vat_percent"], "20")
        self.assertTrue(entry["separate_vat"])
        self.assertIn("DE", entry["supplier_country_notice"])
        self.assertIn("FR", entry["supplier_country_notice"])
        self.assertEqual(entry["epris_status"], "tinkama")
        self.assertTrue(entry["category_labels"][0].startswith("6 - "))
        self.assertNotIn(" > ", entry["category_labels"][0])
        greek = invoice(seller_vat_code="EL123", seller_country_iso="GR", epris_details={})
        self.assertEqual(views.serialize(greek)["supplier_country_notice"], "")

    def test_missing_company_code_does_not_imply_simplified_invoice(self):
        entry = views.serialize(invoice(seller_id="", epris_details={}))
        self.assertFalse(entry["epris_details"]["simplified_invoice"])
        self.assertEqual(entry["epris_status"], "tinkama")

    def test_missing_rate_is_unknown_never_one_to_one(self):
        with patch.object(views.CurrencyRate, "objects") as manager:
            manager.filter.return_value.order_by.return_value.first.return_value = None
            self.assertIsNone(views.to_eur(1000, "PLN", date(2025, 1, 1)))


class EprisApiTests(unittest.TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = SimpleNamespace(id=7, is_authenticated=True)
        self.payload = {"contractor_keys": ["id:123"], "country": "DE", "date_from": "2025-01-01", "date_to": "2025-12-31", "document_ids": [1]}
        # Fix the test clock without changing production code or accessing a database.
        self.period = patch.object(views, "period_info", side_effect=lambda a, b, remainder: period_info(a, b, remainder, date(2026, 9, 7)))
        self.period.start()
        self.addCleanup(self.period.stop)

    def post(self, view, data=None):
        request = self.factory.post("/epris/", self.payload if data is None else data, format="json")
        force_authenticate(request, self.user)
        return view.as_view()(request)

    def patch_claim(self, doc, details):
        doc.save = Mock()
        qs = Mock()
        qs.filter.return_value.first.return_value = doc
        request = self.factory.patch("/epris/documents/1/codes/", {
            "contractor_keys": ["id:123"], "codes": doc.epris_codes, "details": details,
        }, format="json")
        force_authenticate(request, self.user)
        with patch.object(views, "source_documents", return_value=qs):
            return views.EprisDocumentCodesView.as_view()(request, pk=1)

    def test_claim_amount_and_percentage_updates_are_linked(self):
        doc = invoice(epris_details={})
        response = self.patch_claim(doc, {"deductible_vat": "60,00"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["epris_details"]["deduction_percent"], "30.00")
        response = self.patch_claim(doc, {"deduction_percent": "25,00"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["epris_details"]["deductible_vat"], "50.00")
        self.assertEqual(response.data["epris_details"]["prorata_rate"], "100.00")

    def test_exact_amount_survives_rounded_percentage(self):
        doc = invoice(vat_amount=Decimal("99999.99"), epris_details={})
        response = self.patch_claim(doc, {"deductible_vat": "33333,34"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["epris_details"]["deductible_vat"], "33333.34")
        self.assertEqual(response.data["epris_details"]["deduction_percent"], "33.33")
        self.assertEqual(response.data["epris_status"], "tinkama")

    def test_entered_percentage_survives_half_cent_rounding(self):
        doc = invoice(vat_amount=Decimal("1.01"), epris_details={})
        response = self.patch_claim(doc, {"deduction_percent": "50,00", "deductible_vat": "0,50"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["epris_details"]["deduction_percent"], "50.00")
        self.assertEqual(response.data["epris_details"]["deductible_vat"], "0.50")

    def test_claim_cannot_exceed_document_vat_or_activity_limit(self):
        for details in [{"deductible_vat": "200,01"}, {"deduction_percent": "100,01"}, {"deductible_vat": "-1"}, {"deductible_vat": "150", "prorata_rate": "50"}]:
            with self.subTest(details=details):
                doc = invoice(epris_details={})
                self.assertEqual(self.patch_claim(doc, details).status_code, 400)
                doc.save.assert_not_called()

    def test_empty_applicant_rejected(self):
        response = self.post(views.EprisDocumentsView, {**self.payload, "contractor_keys": []})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.post(views.EprisDocumentsView, {**self.payload, "country": []}).status_code, 400)

    def test_source_documents_scoped_to_authenticated_user(self):
        with patch.object(views.ScannedDocument, "objects") as manager:
            views.source_documents(self.user)
            self.assertEqual(manager.filter.call_args.kwargs["user"], self.user)

    def test_candidate_direction_sales_and_ambiguity_excluded(self):
        purchase, sale, ambiguous = invoice(), invoice(id=2, buyer_id="other", seller_id="123"), invoice(id=3, seller_id="123")
        qs = Mock()
        qs.filter.return_value = qs
        qs.order_by.return_value.iterator.return_value = iter([purchase, sale, ambiguous])
        with patch.object(views, "source_documents", return_value=qs):
            docs, counts = views.candidates(self.user, {"id:123"})
        self.assertEqual([d.id for d in docs], [1])
        self.assertEqual(counts["pardavimas"], 1)
        self.assertEqual(counts["ambiguous"], 1)

    def test_export_requires_explicit_valid_selection(self):
        for ids in [[], [2], [1, 2], [1, 1], "1"]:
            with self.subTest(ids=ids), patch.object(views, "candidates", return_value=([invoice()], {})):
                self.assertEqual(self.post(views.EprisExportView, {**self.payload, "document_ids": ids}).status_code, 400)

    def test_export_threshold_uses_selected_deductible_not_full_vat(self):
        doc = invoice()
        doc.epris_details["deductible_vat"] = "49"
        with patch.object(views, "candidates", return_value=([doc], {})):
            response = self.post(views.EprisExportView)
        self.assertEqual(response.status_code, 400)
        self.assertIn("nesiekia", str(response.data))
        doc.epris_details["deductible_vat"] = "50"
        with patch.object(views, "candidates", return_value=([doc], {})):
            self.assertEqual(self.post(views.EprisExportView).status_code, 200)

    def test_expired_period_allows_downloads_but_keeps_other_checks(self):
        payload = {**self.payload, "date_from": "2024-01-01", "date_to": "2024-12-31"}
        doc = invoice(invoice_date=date(2024, 5, 1), file=SimpleNamespace(
            name="invoice.pdf", open=lambda mode: io.BytesIO(b"%PDF-1.4\nTest")))
        with patch.object(views, "candidates", return_value=([doc], {})):
            listing = self.post(views.EprisDocumentsView, payload)
            self.assertTrue(listing.data["deadline_passed"])
            self.assertEqual(listing.data["deadline"], "2025-09-30")
            self.assertEqual(listing.data["period_errors"], [])
            for output in ["csv", "attachments"]:
                with self.subTest(output=output):
                    self.assertEqual(self.post(views.EprisExportView, {**payload, "format": output}).status_code, 200)
            doc.epris_details["deductible_vat"] = "49"
            self.assertEqual(self.post(views.EprisExportView, payload).status_code, 400)
            doc.epris_details["deductible_vat"] = "100"
            doc.seller_address = ""
            self.assertEqual(self.post(views.EprisExportView, payload).status_code, 400)

    def test_export_revalidates_rows_and_never_marks_submitted(self):
        doc = invoice()
        with patch.object(views, "candidates", return_value=([doc], {})):
            response = self.post(views.EprisExportView)
            self.assertEqual(response.status_code, 200)
            self.assertIsNone(doc.epris_submitted_at)
            doc.seller_address = ""
            self.assertEqual(self.post(views.EprisExportView).status_code, 400)

    def test_duplicate_selection_blocked(self):
        with patch.object(views, "candidates", return_value=([invoice(), invoice(id=2)], {})):
            response = self.post(views.EprisExportView, {**self.payload, "document_ids": [1, 2]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("kopijos", str(response.data))

    def test_pagination_input_validation(self):
        with patch.object(views, "candidates", return_value=([invoice()], {})):
            for values in [{"offset": -1}, {"limit": 0}, {"limit": 501}, {"offset": "bad"}]:
                self.assertEqual(self.post(views.EprisDocumentsView, {**self.payload, **values}).status_code, 400)

    def test_flat_attachment_archive(self):
        doc = invoice(file=SimpleNamespace(name="uploads/user/test.PDF", open=lambda mode: io.BytesIO(b"%PDF-1.4\nTest")))
        with patch.object(views, "candidates", return_value=([doc], {})):
            response = self.post(views.EprisExportView, {**self.payload, "format": "attachments"})
        self.assertEqual(response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(archive.namelist(), ["500001_A42.pdf"])
        self.assertEqual(attachment_name(doc, 1), "500001_A42.pdf")

    def test_attachment_names_use_safe_invoice_numbers_and_stay_unique(self):
        doc = invoice(document_series="ĄŽ", document_number='12/34\\56:*?"<>|\x00\n', file=SimpleNamespace(name="original.PDF"))
        self.assertEqual(attachment_name(doc, 1), "500001_AZ12_34_56.pdf")
        self.assertEqual(attachment_name(doc, 2), "500002_AZ12_34_56.pdf")
        doc.document_series, doc.document_number = "", "../.."
        self.assertEqual(attachment_name(doc, 1), "500001_saskaita.pdf")
        doc.document_number = "N" * 300
        self.assertEqual(attachment_name(doc, 1), "500001_" + "N" * 100 + ".pdf")

    def test_missing_unsupported_and_oversized_attachments(self):
        for file in [None, SimpleNamespace(name="invoice.docx"), SimpleNamespace(name="invoice.pdf", open=lambda mode: io.BytesIO(b"x" * 5_000_001))]:
            with patch.object(views, "candidates", return_value=([invoice(file=file)], {})):
                self.assertEqual(self.post(views.EprisExportView, {**self.payload, "format": "attachments"}).status_code, 400)

    def test_png_copy_is_converted_to_pdf(self):
        from PIL import Image
        content = io.BytesIO()
        Image.new("RGBA", (20, 20), "white").save(content, "PNG")
        doc = invoice(file=SimpleNamespace(name="invoice.png", open=lambda mode: io.BytesIO(content.getvalue())))
        self.assertEqual(attachment_name(doc, 1), "500001_A42.pdf")
        self.assertTrue(attachment_content(doc).startswith(b"%PDF"))

    def test_patch_requires_purchase_and_saves_review(self):
        doc = invoice()
        doc.save = Mock()
        qs = Mock()
        qs.filter.return_value.first.return_value = doc
        body = {"contractor_keys": ["id:123"], "codes": doc.epris_codes, "details": doc.epris_details}
        request = self.factory.patch("/epris/documents/1/codes/", body, format="json")
        force_authenticate(request, self.user)
        with patch.object(views, "source_documents", return_value=qs):
            response = views.EprisDocumentCodesView.as_view()(request, pk=1)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["epris_status"], "tinkama")
        doc.save.assert_called_once()
        request = self.factory.patch("/epris/documents/1/codes/", {**body, "contractor_keys": ["id:987"]}, format="json")
        force_authenticate(request, self.user)
        with patch.object(views, "source_documents", return_value=qs):
            self.assertEqual(views.EprisDocumentCodesView.as_view()(request, pk=1).status_code, 400)

    def test_patch_category_only_and_automatic_country(self):
        doc = invoice(epris_details={})
        doc.save = Mock()
        qs = Mock()
        qs.filter.return_value.first.return_value = doc
        request = self.factory.patch("/epris/documents/1/codes/", {"contractor_keys": ["id:123"], "codes": doc.epris_codes}, format="json")
        force_authenticate(request, self.user)
        with patch.object(views, "source_documents", return_value=qs):
            response = views.EprisDocumentCodesView.as_view()(request, pk=1)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["epris_status"], "tinkama")
        self.assertEqual(response.data["epris_details"]["deductible_vat"], "200.00")
        self.assertNotIn("refund_country", doc.epris_details)
        self.assertNotIn("deductible_vat", doc.epris_details)
        doc.seller_vat_code = "FR123456789"
        self.assertEqual(refund_country(doc), "FR")

    def test_foreign_country_and_period_document_selection_rejected(self):
        for changes in [{"country": "FR"}, {"date_from": "2024-01-01", "date_to": "2024-12-31"}]:
            with patch.object(views, "candidates", return_value=([invoice()], {})):
                self.assertEqual(self.post(views.EprisExportView, {**self.payload, **changes}).status_code, 400)
