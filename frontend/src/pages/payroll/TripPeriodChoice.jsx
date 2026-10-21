import { useEffect, useState } from "react";
import { Alert, Box, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";

import { apiError, payrollApi } from "../../api/payroll";

const num = (v) => Number(v || 0);
const fmt = (v) => num(v).toLocaleString("lt-LT", { maximumFractionDigits: 2 });

// Paskutinis apskaitinio laikotarpio mėnuo: kiek viršyta norma ir kiek iš to - kelionių komandiruotėse valandos
export function tripExcess(row) {
  const p = row?.period;
  if (!row?.summed || !p || !num(p.trip_hours)) return null;
  const excess = num(p.worked_before) + num(row.worked_hours) - num(p.period_norm);
  if (excess <= 0) return null;
  return { excess, trip: Math.min(excess, num(p.trip_hours)), choice: p.trip_choice || "rest" };
}

// Pasirinkimas vienam darbuotojui (tabelyje ir DU puslapyje)
export function TripChoiceBanner({ row, year, month, onChanged, disabled, showName = false }) {
  const x = tripExcess(row);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!x) return null;
  const change = async (choice) => {
    if (!choice || choice === x.choice) return;
    setBusy(true); setError("");
    try {
      await payrollApi.setTimesheetHours({ action: "trip_choice", employee: row.employee, year, month, choice });
      onChanged?.();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Box sx={{ px: 1.5, py: 1.1, borderRadius: 2, bgcolor: "#EDF3FB" }}>
      <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} gap={1.25}>
        <Stack direction="row" alignItems="center" gap={1.2} sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "#1E3A6E", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <FlightTakeoffIcon sx={{ fontSize: 16, color: "#FFFFFF" }} />
          </Box>
          <Typography sx={{ fontSize: 12.5, color: "#1E3A6E", lineHeight: 1.5 }}>
            {showName && <b>{row.employee_name}: </b>}
            Laikotarpio pabaiga – norma viršyta <b>{fmt(x.excess)} val.</b>, iš jų <b>{fmt(x.trip)} val.</b> – kelionės komandiruotėse,
            už kurias suteiktas kompensacinis poilsis (DK 107 str.).
          </Typography>
        </Stack>
        <ToggleButtonGroup exclusive size="small" value={x.choice} onChange={(e, v) => change(v)} disabled={busy || disabled}
          sx={{ flexShrink: 0, bgcolor: "#FFFFFF", "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 650, fontSize: 12, px: 1.25, py: .5,
            color: "#475467", "&.Mui-selected": { bgcolor: "#1E3A6E", color: "#FFFFFF", "&:hover": { bgcolor: "#163057" } } } }}>
          <ToggleButton value="rest">Kompensuota poilsiu</ToggleButton>
          <ToggleButton value="overtime">Apmokėti kaip viršvalandžius</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Typography sx={{ fontSize: 11.5, color: "#475467", mt: .6 }}>
        {x.choice === "rest"
          ? `Šios ${fmt(x.trip)} val. neapmokamos kaip viršvalandžiai – darbuotojas jas atsiima poilsiu.`
          : `Šios ${fmt(x.trip)} val. bus apmokėtos kaip viršvalandžiai, o kompensacinio poilsio likutis sumažės tiek pat.`}
        {" "}Galutinė VDI pozicija dar tikslinama.
      </Typography>
      {error && <Alert severity="error" sx={{ mt: 1, py: 0 }}>{error}</Alert>}
    </Box>
  );
}

// DU puslapiui: visi darbuotojai, kuriems laikotarpio pabaigoje reikia pasirinkimo
export function TripPeriodBlock({ year, month, locked, onChanged }) {
  const [rows, setRows] = useState([]);
  const load = () => payrollApi.timesheetFull(year, month).then((d) => setRows((d?.rows || []).filter((r) => tripExcess(r)))).catch(() => setRows([]));
  useEffect(() => { load(); }, [year, month]);  // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.75, mb: 2, borderRadius: 2.5, borderColor: "#C9D7EE" }}>
      <Typography sx={{ fontSize: 14, fontWeight: 750, color: "#1E3A6E", mb: 1.25 }}>
        Laikotarpio pabaiga: kelionių komandiruotėse valandos ({rows.length})
      </Typography>
      <Stack gap={1}>
        {rows.map((r) => (
          <TripChoiceBanner key={r.employee} row={r} year={year} month={month} disabled={locked} showName
            onChanged={() => { load(); onChanged?.(); }} />
        ))}
      </Stack>
    </Paper>
  );
}
