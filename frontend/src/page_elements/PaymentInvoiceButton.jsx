import { useState } from "react";
import { api } from "../api/endpoints";
import { Tooltip, Button, CircularProgress } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { pdf } from "@react-pdf/renderer";
import InvoicePDF from "./InvoicePDF";

// та же мапа, что и в таблице
const SERVICE_CODE_BY_CREDITS = {
  100: "DOK1",
  500: "DOK2",
  1000: "DOK3",
  5000: "DOK4",
  10000: "DOK5",
};

const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (value == null || value === "") return 0;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (amountInCents) => {
  const v = toNumber(amountInCents) / 100;
  return Number.isFinite(v) ? v : 0;
};

export default function PaymentInvoiceButton({ payment }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!payment?.id) return;

    try {
      setLoading(true);

      const { data } = await api.get(`/payments/${payment.id}/invoice/`, {
        withCredentials: true,
      });

      const currencyCode = (data.currency || "EUR").toUpperCase();
      const amountNet = formatMoney(data.net_amount || payment.net_amount);

      const asStr = (v) => v.toFixed(2).replace(".", ",");

      const sumos = {
        tarpineSuma: asStr(amountNet),
        sumaBePvm: asStr(amountNet),
        pvmSuma: "0,00",
        sumaSuPvm: asStr(amountNet),
      };

      const seller = {
        pavadinimas: "Denis Orlov - DokSkenas",
        iv_numeris: "1292165",
        pvmKodas: "",
        adresas: "Kreivasis skg. 18-19, Vilnius",
        telefonas: "",
        bankoPavadinimas: "",
        iban: "",
        swift: "",
      };

      const addr = data.buyer_address || {};
      const buyer = {
        pavadinimas: data.buyer_company_name || data.buyer_email || "",
        imonesKodas: data.buyer_company_code || "",
        pvmKodas: data.buyer_vat_code || "",
        adresas:
          data.buyer_company_address ||
          [addr.line1, addr.line2, addr.postal_code, addr.city]
            .filter(Boolean)
            .join(", "),
        telefonas: "",
        bankoPavadinimas: "",
        iban: data.buyer_company_iban || "",
        swift: "",
      };

      const lineCredits = toNumber(
        data.credits_purchased || payment.credits_purchased
      );
      const serviceCode =
        SERVICE_CODE_BY_CREDITS[lineCredits] || "CREDITS";

      const invoiceData = {
        valiuta: currencyCode,
        pvmTipas: "netaikoma",

        saskaitosSerija: "SF",
        saskaitosNumeris: data.dok_number || String(data.id),
        saskaitosData: data.paid_at,
        moketiIki: data.paid_at,
        uzsakymoNumeris: null,

        seller,
        buyer,

        eilutes: [
          {
            pavadinimas: `${lineCredits} DokSkeno kreditų`,
            kodas: serviceCode,
            barkodas: "",
            kiekis: 1,
            kainaBePvm: amountNet,
            matoVnt: "vnt.",
          },
        ],

        nuolaida: 0,
        pristatymoMokestis: 0,
        pvmProcent: 0,
      };

      const apiBase = import.meta.env.VITE_BASE_API_URL;
      let backendBase = window.location.origin;

      if (apiBase) {
        try {
          backendBase = new URL(apiBase).origin;
        } catch (e) {
          console.warn("Cannot parse VITE_BASE_API_URL, fallback to window.location.origin");
        }
      }

      const logoUrl = `${backendBase}/media/images/dokskenas_logo_for_invoice.jpg`;

      const blob = await pdf(
        <InvoicePDF data={invoiceData} sumos={sumos} logo={logoUrl} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `saskaita-${invoiceData.saskaitosNumeris || data.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to generate PDF invoice", e);
      alert("Nepavyko sugeneruoti PDF sąskaitos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title="Atsisiųsti PDF sąskaitą">
      <span>
        <Button
          variant="outlined"
          size="small"
          onClick={handleDownload}
          disabled={loading}
          sx={{
            minWidth: 0,
            p: 0.5,
            borderRadius: 1.5,
          }}
        >
          {loading ? (
            <CircularProgress size={16} />
          ) : (
            <DownloadIcon fontSize="small" />
          )}
        </Button>
      </span>
    </Tooltip>
  );
}