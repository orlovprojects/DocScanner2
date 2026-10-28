import { useEffect, useMemo, useState } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { MONTHS, payrollApi } from "../../api/payroll";

// DU DokSkenas pradžia: iki šio mėnesio DU (grafikai, tabeliai, komandiruotės, atlyginimai, DU deklaracijos)
// buvo tvarkomas kitoje programoje. Serveris: runs/period -> {start: "YYYY-MM" | null, default, from_migration}

export const MONTHS_ACC = ["sausį", "vasarį", "kovą", "balandį", "gegužę", "birželį", "liepą", "rugpjūtį", "rugsėjį", "spalį", "lapkritį", "gruodį"];
export const MONTHS_GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];

export const parseYm = (v) => {
  const m = /^(\d{4})-(\d{2})/.exec(v || "");
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
};
export const ymKey = (year, month) => `${year}-${String(month).padStart(2, "0")}`;
export const monthName = (y, m) => `${y} m. ${MONTHS[m - 1].toLowerCase()}`;   // 2026 m. spalis
export const monthAcc = (y, m) => `${y} m. ${MONTHS_ACC[m - 1]}`;                 // (už / į) 2026 m. spalį
export const isBeforeStart = (start, year, month) =>
  !!start && !!year && (year < start.year || (year === start.year && month < start.month));

// {loaded, start: {year, month} | null, period}
export function useDuStart() {
  const [period, setPeriod] = useState(null);
  useEffect(() => {
    let alive = true;
    payrollApi.payrollPeriod().then((p) => alive && setPeriod(p || {})).catch(() => alive && setPeriod({}));
    return () => { alive = false; };
  }, []);
  const start = useMemo(() => parseYm(period?.start), [period?.start]);     // stabilus objektas (naudojamas useEffect)
  return { loaded: period !== null, start, period };
}

// Kortelė mėnesiui iki DU pradžios. text - skyriaus sakinys; fromMigration - pradžia iš perkėlimo (nustatymuose nekeičiama)
export function DuStartNotice({ start, year, month, onGo, onShift, text, fromMigration = false }) {
  return (
    <Box>
      {onShift && (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: .35, px: .6, py: .45, mb: 2, border: "1px solid #E4E7EC", borderRadius: 2, bgcolor: "#FFFFFF" }}>
          <IconButton size="small" aria-label="Ankstesnis mėnuo" onClick={() => onShift(-1)} sx={{ borderRadius: 1.35, width: 31, height: 31 }}><ChevronLeftIcon fontSize="small" /></IconButton>
          <Box sx={{ minWidth: { xs: 135, sm: 162 }, textAlign: "center" }}>
            <Typography sx={{ fontSize: 10, color: "#98A2B3", lineHeight: 1.15, fontWeight: 700 }}>LAIKOTARPIS</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: "#101828", textTransform: "capitalize", lineHeight: 1.5 }}>
              {MONTHS[month - 1]} {year}
            </Typography>
          </Box>
          <IconButton size="small" aria-label="Kitas mėnuo" onClick={() => onShift(1)} sx={{ borderRadius: 1.35, width: 31, height: 31 }}><ChevronRightIcon fontSize="small" /></IconButton>
        </Box>
      )}
      <Box sx={{ border: "1px solid #EAECF0", borderRadius: 2.5, bgcolor: "#FFFFFF", p: { xs: 3, md: 5 }, textAlign: "center" }}>
        <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#101828" }}>{monthName(year, month)} – ankstesnėje programoje</Typography>
        <Typography sx={{ fontSize: 14, color: "#475467", mt: 1, maxWidth: 560, mx: "auto", lineHeight: 1.6 }}>
          Darbo užmokestį DokSkene pradėjote vesti nuo {start.year} m. {MONTHS_GEN[start.month - 1]}. {text}
        </Typography>
        <Button variant="contained" disableElevation endIcon={<ArrowForwardRoundedIcon />} onClick={onGo}
          sx={{ mt: 2.5, textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
          Eiti į {monthAcc(start.year, start.month)}
        </Button>
        <Typography sx={{ fontSize: 12.5, color: "#98A2B3", mt: 2 }}>
          {fromMigration
            ? "Pradžios mėnuo nustatytas perkeliant duomenis iš ankstesnės programos."
            : "Pradėjote anksčiau? Pakeiskite pradžios mėnesį DU nustatymuose."}
        </Typography>
      </Box>
    </Box>
  );
}
