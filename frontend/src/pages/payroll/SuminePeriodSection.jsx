import { Alert, Box, MenuItem, Stack, TextField, Typography } from "@mui/material";

const NOM = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa", "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis"];
export const GEN = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export const norm = (months, anchor) => ((Number(anchor || 1) - 1) % months) + 1;

// Laikotarpių pradžios mėnesiai (1..12), pvz. 3 mėn. nuo sausio -> [1, 4, 7, 10]
export const startsOf = (months, anchor) => Array.from({ length: 12 / months }, (_, i) => ((norm(months, anchor) - 1 + i * months) % 12) + 1)
  .sort((a, b) => a - b);

// „sausis–kovas, balandis–birželis, liepa–rugsėjis, spalis–gruodis“ (short - tik 2 pirmi)
export const anchorLabel = (months, anchor, short = false) => {
  const mo = Number(months);
  if (mo === 1) return "kiekvienas kalendorinis mėnuo";
  const r = startsOf(mo, anchor).map((x) => `${NOM[x - 1]}–${NOM[(x - 2 + mo) % 12]}`);
  return short && r.length > 2 ? `${r.slice(0, 2).join(", ")}, …` : r.join(", ");
};

export const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);

// Einamasis + kiti `count` laikotarpių
export function periodsFrom(today, months, anchor, count = 5) {
  const a = norm(months, anchor);
  let y = today.getFullYear();
  let m = today.getMonth() + 1;
  const back = (((m - a) % months) + months) % months;
  m -= back;
  if (m < 1) { m += 12; y -= 1; }
  const out = [];
  for (let i = 0; i <= count; i += 1) {
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m - 1 + months, 0);
    out.push({ start, end, current: i === 0 });
    m += months;
    if (m > 12) { m -= 12; y += 1; }
  }
  return out;
}

export const periodLabel = ({ start, end }) => {
  const sy = start.getFullYear();
  const ey = end.getFullYear();
  const sm = NOM[start.getMonth()];
  const em = NOM[end.getMonth()];
  if (start.getMonth() === end.getMonth() && sy === ey) return { year: `${sy} m.`, months: sm };
  if (sy === ey) return { year: `${sy} m.`, months: `${sm} – ${em}` };
  return { year: `${sy}–${ey} m.`, months: `${sm} – ${em}` };
};

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function SuminePeriodSection({ months, anchor, savedMonths, savedAnchor, onChange }) {
  const mo = Number(months) || 3;
  const an = norm(mo, anchor);
  const today = new Date();
  const periods = periodsFrom(today, mo, an, 5);
  const changed = Number(savedMonths || 3) !== mo || norm(Number(savedMonths || 3), savedAnchor) !== an;

  const cur = periods[0];
  const total = Math.round((cur.end - cur.start) / 864e5) + 1;
  const passed = Math.min(total, Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - cur.start) / 864e5) + 1);

  return (
    <>
      <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
        <TextField select label="Apskaitinio laikotarpio trukmė" value={mo} fullWidth
          onChange={(e) => onChange({ summed_period_months: Number(e.target.value), summed_period_anchor: 1 })}
          SelectProps={{ MenuProps: { disableScrollLock: true } }}>
          <MenuItem value={1}>1 mėnuo</MenuItem>
          <MenuItem value={2}>2 mėnesiai</MenuItem>
          <MenuItem value={3}>3 mėnesiai</MenuItem>
        </TextField>
        {mo > 1 && (
          <TextField select label="Laikotarpiai" value={an} fullWidth
            onChange={(e) => onChange({ summed_period_anchor: Number(e.target.value) })}
            SelectProps={{ MenuProps: { disableScrollLock: true }, renderValue: (v) => cap(anchorLabel(mo, v, true)) }}>
            {Array.from({ length: mo }, (_, i) => i + 1).map((a) => (
              <MenuItem key={a} value={a}>{cap(anchorLabel(mo, a))}</MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, minmax(0,1fr))" }, gap: 1 }}>
        {periods.map((p) => {
          const l = periodLabel(p);
          return (
            <Box key={iso(p.start)} sx={{
              p: 1.25, borderRadius: 2, border: "1px solid", position: "relative",
              borderColor: p.current ? "#84CAFF" : "#EAECF0", bgcolor: p.current ? "#EFF8FF" : "#FFFFFF",
            }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ fontSize: 11.5, color: "#667085" }}>{l.year}</Typography>
                {p.current && (
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#175CD3", bgcolor: "#D1E9FF", px: .75, borderRadius: 1 }}>Dabar</Typography>
                )}
              </Stack>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: "#101828", mt: .25 }}>{l.months}</Typography>
              <Typography sx={{ fontSize: 11.5, color: "#98A2B3" }}>{iso(p.start)} – {iso(p.end)}</Typography>
              {p.current && (
                <Box sx={{ mt: .75, height: 4, borderRadius: 2, bgcolor: "#D1E9FF", overflow: "hidden" }}>
                  <Box sx={{ width: `${(passed / total) * 100}%`, height: "100%", bgcolor: "#2E90FA" }} />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {changed ? (
        <Alert severity="warning" sx={{ py: 0 }}>
          Pakeitimas bus taikomas ir einamajam laikotarpiui – jau sudarytų grafikų normos ir viršvalandžiai bus perskaičiuoti.
          Saugiausia keisti prieš prasidedant naujam laikotarpiui.
        </Alert>
      ) : (
        <Typography variant="caption" color="text.secondary" mt={-1}>
          Taikoma darbuotojams su sumine apskaita. Ne ilgiau kaip 3 mėnesiai (DK 113 str.).
          Konkrečiam darbuotojui kitokį laikotarpį galima nurodyti jo sutartyje.
        </Typography>
      )}
    </>
  );
}
