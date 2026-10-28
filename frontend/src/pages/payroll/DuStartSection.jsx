import { useEffect, useState } from "react";
import { Alert, MenuItem, TextField, Typography } from "@mui/material";

import { payrollApi } from "../../api/payroll";

const MONTHS = ["sausis", "vasaris", "kovas", "balandis", "gegužė", "birželis", "liepa", "rugpjūtis", "rugsėjis", "spalis", "lapkritis", "gruodis"];
const MONTHS_ACC = ["sausį", "vasarį", "kovą", "balandį", "gegužę", "birželį", "liepą", "rugpjūtį", "rugsėjį", "spalį", "lapkritį", "gruodį"];
const label = (ym) => `${ym.slice(0, 4)} m. ${MONTHS[Number(ym.slice(5, 7)) - 1]}`;
const labelAcc = (ym) => `${ym.slice(0, 4)} m. ${MONTHS_ACC[Number(ym.slice(5, 7)) - 1]}`;

// 24 mėn. atgal ... 3 mėn. į priekį
function monthOptions() {
  const d = new Date(); d.setDate(1);
  const out = [];
  for (let k = -24; k <= 3; k += 1) {
    const x = new Date(d.getFullYear(), d.getMonth() + k, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out.reverse();
}

// DU nustatymai: „Darbo užmokestis DokSkenas skaičiuojamas nuo“. value - "YYYY-MM-DD" | "" ; onChange(du_start)
export default function DuStartSection({ value, onChange }) {
  const [period, setPeriod] = useState(null);
  const [check, setCheck] = useState(null);
  useEffect(() => { payrollApi.payrollPeriod().then(setPeriod).catch(() => setPeriod({})); }, []);
  if (!period) return null;

  const saved = period.start || "";
  const cur = (value || "").slice(0, 7) || saved;
  const opts = monthOptions();
  if (cur && !opts.includes(cur)) opts.push(cur);

  const pick = async (ym) => {
    onChange({ du_start: `${ym}-01` });
    setCheck(null);
    if (ym === saved) return;
    try { setCheck(await payrollApi.payrollPeriodCheck(ym)); } catch { setCheck(null); }
  };

  if (period.from_migration) {
    return (
      <>
        <TextField label="Skaičiuojamas nuo" value={saved ? label(saved) : "–"} disabled fullWidth />
        <Typography variant="caption" color="text.secondary" mt={-1}>
          Nustatyta perkeliant duomenis iš kitos programos. Pakeisti galima tik atidarius „Likučių perkėlimas“ iš naujo.
        </Typography>
      </>
    );
  }
  if (!saved && !value) {
    return <Typography variant="body2" color="text.secondary">Bus nustatyta automatiškai, kai pridėsite pirmąjį darbuotoją.</Typography>;
  }
  return (
    <>
      <TextField select label="Skaičiuojamas nuo" value={cur} fullWidth onChange={(e) => pick(e.target.value)}
        SelectProps={{ MenuProps: { disableScrollLock: true } }}>
        {opts.map((ym) => <MenuItem key={ym} value={ym}>{label(ym)}</MenuItem>)}
      </TextField>
      {check && !check.ok && <Alert severity="error" sx={{ py: 0 }}>{check.error}</Alert>}
      {check?.ok && check.skipped?.length > 0 && (
        <Alert severity="info" sx={{ py: 0 }}>
          Bus laikoma, kad skaičiuota kitoje programoje: {check.skipped.map(label).join(", ")}. Šių mėnesių DokSkenas nebereikalaus.
        </Alert>
      )}
      {check?.ok && check.added?.length > 0 && (
        <Alert severity="warning" sx={{ py: 0 }}>
          Tabeliai, atlyginimai ir deklaracijos už {check.added.map(labelAcc).join(", ")} atsiras „Ką reikia padaryti“.
          Jei jie jau pateikti kitoje programoje – pradžios neankstinkite.
        </Alert>
      )}
      {!check && (
        <Typography variant="caption" color="text.secondary" mt={-1}>
          Ankstesni mėnesiai laikomi skaičiuotais kitoje programoje – už juos tabelių, atlyginimų ir deklaracijų DokSkenas nereikalauja.
        </Typography>
      )}
    </>
  );
}
