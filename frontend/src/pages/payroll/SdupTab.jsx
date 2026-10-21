import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";

import { MONTHS, apiError, payrollApi } from "../../api/payroll";
import DarboApmokejimoSistemaPage from "./DarboApmokejimoSistemaPage";

const STATUS = { ready: ["Paruošta", "success"], error: ["Yra klaidų", "error"], submitted: ["Pateikta", "primary"],
  accepted: ["Priimta", "success"], draft: ["Juodraštis", "default"] };

function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

function SdupMonths() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => {
    Promise.all(lastMonths(6).map((m) => payrollApi.declarations(m.year, m.month).then((r) => ({ ...m, items: r.items || r || [] }))))
      .then((all) => setRows(all.map((m) => ({ ...m, it: m.items.find((x) => x.form === "SDUP") })).filter((m) => m.it)))
      .catch((e) => { setError(apiError(e)); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);
  const prepare = async (m) => {
    setBusy(`${m.year}-${m.month}`); setError("");
    try { await payrollApi.generateDeclaration({ form: "SDUP", year: m.year, month: m.month }); load(); }
    catch (e) { setError(apiError(e)); } finally { setBusy(""); }
  };
  const download = async (m) => {
    const blob = await payrollApi.declarationFile(m.it.declaration.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `SDUP_${m.year}-${String(m.month).padStart(2, "0")}.json`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 800 }}>SDUP pranešimai</Typography>
      <Typography sx={{ fontSize: 12.5, color: "text.secondary", mb: 1.5 }}>
        Kas mėnesį iš patvirtinto DU, iki kito mėnesio paskutinės dienos. Failą įkelkite į Sodros EDAS (SDUP → Įkelti JSON).
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {rows === null ? <CircularProgress size={22} /> : rows.length === 0 ? (
        <Alert severity="info">SDUP teikiamas nuo 2027 m. sausio – pirmas pranešimas už sausį iki vasario 28 d.</Alert>
      ) : rows.map((m) => {
        const d = m.it.declaration;
        const [label, color] = STATUS[d?.status] || ["Neparuošta", "default"];
        return (
          <Stack key={`${m.year}-${m.month}`} direction="row" gap={1.5} alignItems="center" flexWrap="wrap"
            sx={{ py: 1, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, minWidth: 160 }}>{m.year} m. {MONTHS[m.month - 1].toLowerCase()}</Typography>
            <Typography sx={{ fontSize: 12.5, color: m.it.correction ? "error.main" : "text.secondary", flex: 1 }}>
              {m.it.correction ? "Patikslinti per 2 darbo dienas – " : ""}iki {m.it.deadline}
            </Typography>
            <Chip size="small" label={label} color={color} variant="outlined" />
            <Button size="small" variant={d ? "outlined" : "contained"} disableElevation disabled={busy === `${m.year}-${m.month}`}
              onClick={() => prepare(m)} sx={{ textTransform: "none" }}>{d ? "Paruošti iš naujo" : "Paruošti"}</Button>
            {d?.status === "ready" || d?.status === "submitted" || d?.status === "accepted" ? (
              <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={() => download(m)} sx={{ textTransform: "none" }}>.json</Button>
            ) : null}
          </Stack>
        );
      })}
    </Paper>
  );
}

export default function SdupTab() {
  return (
    <Box>
      <SdupMonths />
      <DarboApmokejimoSistemaPage embedded />
    </Box>
  );
}
