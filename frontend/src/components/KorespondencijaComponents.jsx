import { useMemo } from "react";
import {
  Box,
  Typography,
  Tooltip,
  ListSubheader,
} from "@mui/material";

import EditableCell from "../components/EditableCell";

// ═══════════════════════════════════════════════════════════
// PIRKIMO sąskaitos — AI naudoja 23, user mato pilną sąrašą
// ═══════════════════════════════════════════════════════════

const PIRKIMO_COMMON = [
  { code: "2010", name: "Žaliavos, medžiagos" },
  { code: "2040", name: "Prekės perpardavimui" },
  { code: "2080", name: "Avansai tiekėjams" },
  { code: "291", name: "Ateinančių laikotarpių sąnaudos" },
  { code: "6002", name: "Įsigytų prekių/paslaugų savikaina" },
  { code: "6200", name: "Komisiniai mokesčiai" },
  { code: "6202", name: "Reklamos sąnaudos" },
  { code: "6300", name: "Nuomos sąnaudos" },
  { code: "6301", name: "Remonto ir eksploatacijos sąnaudos" },
  { code: "6302", name: "Išmokos tretiesiems asmenims" },
  { code: "6303", name: "Draudimo sąnaudos" },
  { code: "6312", name: "Kitos bendrosios sąnaudos" },
  { code: "6802", name: "Palūkanų sąnaudos" },
  { code: "6810", name: "Kitos finansinės sąnaudos" },
];

const PIRKIMO_ALL = [
  { code: "1130", name: "Programinės įrangos įsigijimo savikaina" },
  { code: "1220", name: "Mašinų ir įrangos įsigijimo savikaina" },
  { code: "1230", name: "Transporto priemonių įsigijimo savikaina" },
  { code: "1240", name: "Kitų įrenginių, prietaisų įsigijimo savikaina" },
  { code: "1260", name: "Sumokėti avansai už ilgalaikį materialųjį turtą" },
  { code: "2060", name: "Ilgalaikis turtas, skirtas parduoti" },
  { code: "6000", name: "Parduotų prekių savikaina" },
  { code: "6001", name: "Suteiktų paslaugų savikaina" },
  { code: "6003", name: "Tiesioginės gamybos išlaidos" },
  { code: "6004", name: "Netiesioginės gamybos išlaidos" },
  { code: "6201", name: "Prekybos pastatų ir įrangos nusidėvėjimas" },
  { code: "6203", name: "Darbuotojų darbo užmokestis (pardavimo)" },
  { code: "6208", name: "Kitos pardavimo sąnaudos" },
  { code: "6304", name: "Darbuotojų darbo užmokestis ir susijusios" },
  { code: "6305", name: "Tantjemos ir panašios išmokos" },
  { code: "6306", name: "Ilgalaikio turto nusidėvėjimo sąnaudos" },
  { code: "6307", name: "Nematerialiojo turto amortizacijos sąnaudos" },
  { code: "6308", name: "Veiklos mokesčių sąnaudos" },
  { code: "6311", name: "Baudos ir delspinigiai" },
  { code: "6401", name: "Kitos sąnaudos" },
  { code: "6803", name: "Valiutų kursų nuostoliai" },
  { code: "6804", name: "Baudos ir delspinigiai (finansinės)" },
  { code: "6806", name: "Lizingo palūkanos" },
  { code: "6900", name: "Pelno mokesčio sąnaudos" },
];

const PIRKIMO_COMMON_SET = new Set(PIRKIMO_COMMON.map((a) => a.code));

const PIRKIMO_OPTIONS = [
  ...PIRKIMO_COMMON.map((a) => ({
    label: `${a.code} ${a.name}`,
    value: a.code,
    group: "Dažniausiai naudojamos",
  })),
  ...PIRKIMO_ALL.map((a) => ({
    label: `${a.code} ${a.name}`,
    value: a.code,
    group: "Visos sąskaitos",
  })),
];

// ═══════════════════════════════════════════════════════════
// PARDAVIMO sąskaitos
// ═══════════════════════════════════════════════════════════

const PARDAVIMO_COMMON = [
  { code: "5000", name: "Parduotų prekių pajamos" },
  { code: "5001", name: "Suteiktų paslaugų pajamos" },
];

const PARDAVIMO_ALL = [
  { code: "509", name: "Nuolaidos, grąžinimas (−)" },
  { code: "5009", name: "Apvalinimas (+/−)" },
  { code: "5400", name: "Ilgalaikio turto perleidimo pelnas" },
  { code: "5401", name: "Kitos veiklos pajamos" },
  { code: "5600", name: "Ilgalaikių investicijų palūkanų pajamos" },
  { code: "5803", name: "Teigiama valiutų kursų įtaka" },
  { code: "5804", name: "Baudų ir delspinigių pajamos" },
  { code: "5810", name: "Kitos finansinės pajamos" },
];

const PARDAVIMO_OPTIONS = [
  ...PARDAVIMO_COMMON.map((a) => ({
    label: `${a.code} ${a.name}`,
    value: a.code,
    group: "Dažniausiai naudojamos",
  })),
  ...PARDAVIMO_ALL.map((a) => ({
    label: `${a.code} ${a.name}`,
    value: a.code,
    group: "Visos sąskaitos",
  })),
];

// ═══════════════════════════════════════════════════════════
// Name maps
// ═══════════════════════════════════════════════════════════

const ALL_ACCOUNTS = [
  ...PIRKIMO_COMMON, ...PIRKIMO_ALL,
  ...PARDAVIMO_COMMON, ...PARDAVIMO_ALL,
];

const ACCOUNT_NAME_MAP = Object.fromEntries(
  ALL_ACCOUNTS.map((a) => [a.code, a.name])
);

const EXTRA_NAMES = {
  "2410": "Pirkėjų skolos",
  "2441": "Gautinas PVM",
  "4430": "Skolos tiekėjams",
  "4492": "Mokėtinas PVM",
};

function getAccountName(code) {
  return ACCOUNT_NAME_MAP[code] || EXTRA_NAMES[code] || code;
}

// ═══════════════════════════════════════════════════════════
// Pirkimo → Pardavimo mapping
// ═══════════════════════════════════════════════════════════

const PIRKIMO_TO_PARDAVIMO = {
  "2010": "5000",
  "2040": "5000",
  "6000": "5000",
  "6002": "5000",
  "6003": "5000",
  "6004": "5000",
};

function derivePardavimo(pirkimoCode, doc) {
  if (pirkimoCode && PIRKIMO_TO_PARDAVIMO[pirkimoCode]) {
    return PIRKIMO_TO_PARDAVIMO[pirkimoCode];
  }
  if (doc?.traded_type === "goods" || doc?.preke_paslauga === "1") {
    return "5000";
  }
  return "5001";
}

function getEffectivePardavimo(doc) {
  if (doc?.pardavimo_saskaita) return doc.pardavimo_saskaita;
  return derivePardavimo(doc?.pirkimo_saskaita, doc);
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function fmtSum(val) {
  const n = Number(val || 0);
  if (isNaN(n) || n === 0) return "—";
  return n.toLocaleString("lt-LT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function resolveDirection(doc, selectedCpKey) {
  if (!selectedCpKey || !doc) return null;

  const mkKey = (id, vat, name) => {
    const idStr = id == null ? "" : String(id).trim();
    if (idStr) return `id:${idStr}`;
    const normVat = (vat || "").trim().toLowerCase();
    const normName = (name || "").trim().toLowerCase();
    return normVat || normName;
  };

  const sKey = mkKey(doc.seller_id, doc.seller_vat_code, doc.seller_name);
  const bKey = mkKey(doc.buyer_id, doc.buyer_vat_code, doc.buyer_name);

  if (selectedCpKey === sKey) return "pardavimas";
  if (selectedCpKey === bKey) return "pirkimas";
  return null;
}

// ═══════════════════════════════════════════════════════════
// KorespondencijaSummary
// ═══════════════════════════════════════════════════════════

function KorespondencijaSummary({ doc, selectedCpKey, lineItems }) {
  const direction = resolveDirection(doc, selectedCpKey);

  const summary = useMemo(() => {
    if (!direction) return null;

    const isPirkimas = direction === "pirkimas";
    const vatAmount = Number(doc.vat_amount || 0);
    const amountWoVat = Number(doc.amount_wo_vat || 0);
    const amountWithVat = Number(doc.amount_with_vat || 0);
    const isDetaliai = doc.scan_type === "detaliai";
    const korSummary = doc.kor_summary;
    const hasLineItems = lineItems?.length > 0;

    const mainLines = [];
    const skolaLines = [];

    if (isPirkimas) {
      if (isDetaliai && korSummary?.pirkimas?.length > 0) {
        for (const g of korSummary.pirkimas) {
          const code = g.code || "6312";
          mainLines.push({
            side: "D", code, name: getAccountName(code),
            suma: Number(g.subtotal_sum || 0), count: g.count,
            editable: false, ids: [],
          });
        }
      } else if (isDetaliai && hasLineItems) {
        const groups = {};
        for (const li of lineItems) {
          const code = li.pirkimo_saskaita || "6312";
          if (!groups[code]) groups[code] = { suma: 0, count: 0 };
          groups[code].suma += Number(li.subtotal || 0);
          groups[code].count += 1;
        }
        const sorted = Object.entries(groups).sort((a, b) =>
          a[0].localeCompare(b[0])
        );
        for (const [code, { suma, count }] of sorted) {
          mainLines.push({
            side: "D", code, name: getAccountName(code), suma, count,
            editable: false, ids: [],
          });
        }
      } else {
        const code = doc.pirkimo_saskaita || "6312";
        mainLines.push({
          side: "D", code, name: getAccountName(code), suma: amountWoVat, count: null,
          editable: false, ids: [],
        });
      }

      if (vatAmount !== 0) {
        mainLines.push({
          side: "D", code: "2441", name: "Gautinas PVM", suma: vatAmount, count: null,
          editable: false, ids: [],
        });
      }

      skolaLines.push({
        side: "K", code: "4430", name: "Skolos tiekėjams", suma: amountWithVat, count: null,
        editable: false, ids: [],
      });
    } else {
      // Pardavimas — visos reikšmės iš backendo, jokių skaičiavimų.
      const isKreditine = doc.invoice_type === "kreditine";
      const pajSide = isKreditine ? "D" : "K";
      const pvmSide = isKreditine ? "D" : "K";
      const skolaSide = isKreditine ? "K" : "D";

      if (hasLineItems) {
        const groups = {};
        for (const li of lineItems) {
          const code = li.kredito_saskaita || li.pardavimo_saskaita;
          if (!code) continue;
          if (!groups[code]) groups[code] = { suma: 0, count: 0, ids: [] };
          groups[code].suma += Math.abs(Number(li.subtotal || 0));
          groups[code].count += 1;
          groups[code].ids.push(li.id);
        }
        for (const [code, { suma, count, ids }] of Object.entries(groups)) {
          mainLines.push({
            side: pajSide, code, name: getAccountName(code),
            suma, count, editable: true, ids,
          });
        }
      } else {
        const code = doc.kredito_saskaita || doc.pardavimo_saskaita;
        if (code) {
          mainLines.push({
            side: pajSide, code, name: getAccountName(code),
            suma: Math.abs(amountWoVat), count: null, editable: true, ids: [],
          });
        }
      }

      if (vatAmount !== 0) {
        mainLines.push({
          side: pvmSide, code: "4492", name: "Mokėtinas PVM",
          suma: Math.abs(vatAmount), count: null, editable: false, ids: [],
        });
      }

      skolaLines.push({
        side: skolaSide, code: "2410", name: "Pirkėjų skolos",
        suma: Math.abs(amountWithVat), count: null, editable: false, ids: [],
      });
    }

    const lines = [...mainLines, ...skolaLines];
    return { direction, lines };
  }, [doc, selectedCpKey, lineItems, direction]);

  if (!selectedCpKey) {
    return (
      <Box sx={{ p: 1.25, borderRadius: "8px", bgcolor: "action.hover" }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontStyle: "italic" }}>
          Pasirinkite kontrahentą, kad matyti korespondenciją
        </Typography>
      </Box>
    );
  }

  if (!summary) {
    return (
      <Box sx={{ p: 1.25, borderRadius: "8px", bgcolor: "action.hover" }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontStyle: "italic" }}>
          Nepavyko nustatyti krypties (pirkimas/pardavimas)
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
        <Box
          component="span"
          sx={{
            fontSize: 11, fontWeight: 600, px: 0.75, py: 0.2, borderRadius: "4px",
            bgcolor: summary.direction === "pirkimas" ? "#EFF6FF" : "#F0FDF4",
            color: summary.direction === "pirkimas" ? "#3B82F6" : "#22C55E",
          }}
        >
          {summary.direction === "pirkimas" ? "Pirkimas" : "Pardavimas"}
        </Box>
      </Box>

      <Box
        sx={{
          borderRadius: "8px", border: "0.5px solid",
          borderColor: "divider", overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "grid", gridTemplateColumns: "36px 60px 1fr 80px",
            px: 1.25, py: 0.5, bgcolor: "action.hover",
            borderBottom: "0.5px solid", borderColor: "divider",
          }}
        >
          <Typography sx={{ fontSize: 10, color: "text.secondary", fontWeight: 500 }}>D/K</Typography>
          <Typography sx={{ fontSize: 10, color: "text.secondary", fontWeight: 500 }}>Kodas</Typography>
          <Typography sx={{ fontSize: 10, color: "text.secondary", fontWeight: 500 }}>Pavadinimas</Typography>
          <Typography sx={{ fontSize: 10, color: "text.secondary", fontWeight: 500, textAlign: "right" }}>Suma</Typography>
        </Box>

        {summary.lines.map((line, i) => (
          <Box
            key={`${line.side}-${line.code}-${i}`}
            sx={{
              display: "grid", gridTemplateColumns: "36px 60px 1fr 80px",
              px: 1.25, py: 0.75,
              borderBottom: i < summary.lines.length - 1 ? "0.5px solid" : "none",
              borderColor: "divider", alignItems: "center",
            }}
          >
            <Box>
              <Box
                component="span"
                sx={{
                  fontSize: 10, px: 0.5, py: 0.15, borderRadius: "3px", fontWeight: 600,
                  bgcolor: line.side === "D" ? "#EFF6FF" : "#FEF2F2",
                  color: line.side === "D" ? "#3B82F6" : "#EF4444",
                }}
              >
                {line.side}
              </Box>
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{line.code}</Typography>
            <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500 }}>
              {line.name}
              {line.count != null && (
                <Box component="span" sx={{ ml: 0.5, fontSize: 10, color: "text.disabled" }}>
                  ({line.count} eil.)
                </Box>
              )}
            </Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 500, textAlign: "right" }}>
              {fmtSum(line.suma)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════
// PirkimoSaskaitaField
// ═══════════════════════════════════════════════════════════
function PirkimoSaskaitaField({ value, pardavimoValue, onChange, selectedCpKey, isMobile, doc }) {
  if (!doc) return null;

  if (!selectedCpKey) {
    return (
      <Typography component="div" sx={{ fontSize: isMobile ? "0.85rem" : "inherit" }}>
        Kor. sąskaita: <b>Pasirinkite kontrahentą</b>
      </Typography>
    );
  }

  const direction = resolveDirection(doc, selectedCpKey);

  if (direction === "pardavimas") {
    const pardCode = pardavimoValue || derivePardavimo(value, doc);
    const pardLabel = `${pardCode} ${getAccountName(pardCode)}`;

    return (
      <Typography component="div" sx={{ fontSize: isMobile ? "0.85rem" : "inherit" }}>
        Kor. sąskaita:{" "}
        <EditableCell
          value={pardCode}
          inputType="select"
          options={PARDAVIMO_OPTIONS}
          getOptionLabel={(o) => o.label}
          onSave={(v) => onChange(v, "pardavimo_saskaita")}
          renderDisplay={() => <b>{pardLabel}</b>}
          sx={{
            minWidth: 300,
            "& .MuiAutocomplete-root": { minWidth: 280 },
          }}
        />
      </Typography>
    );
  }

  const displayValue = value || "6312";
  const displayLabel = `${displayValue} ${getAccountName(displayValue)}`;

  return (
    <Typography component="div" sx={{ fontSize: isMobile ? "0.85rem" : "inherit" }}>
      Kor. sąskaita:{" "}
      <EditableCell
        value={displayValue}
        inputType="select"
        options={PIRKIMO_OPTIONS}
        getOptionLabel={(o) => o.label}
        onSave={(v) => onChange(v, "pirkimo_saskaita")}
        renderDisplay={() => <b>{displayLabel}</b>}
        sx={{
          minWidth: 300,
          "& .MuiAutocomplete-root": { minWidth: 280 },
        }}
      />
    </Typography>
  );
}

export {
  KorespondencijaSummary,
  PirkimoSaskaitaField,
  PIRKIMO_COMMON,
  PIRKIMO_ALL,
  PIRKIMO_OPTIONS,
  PARDAVIMO_COMMON,
  PARDAVIMO_ALL,
  PARDAVIMO_OPTIONS,
  PIRKIMO_TO_PARDAVIMO,
  ACCOUNT_NAME_MAP,
  EXTRA_NAMES,
  getAccountName,
  getEffectivePardavimo,
  derivePardavimo,
  resolveDirection,
};