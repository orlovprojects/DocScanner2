import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton,
  MenuItem, Stack, Switch, TextField, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import { apiError, payrollApi } from "../../api/payroll";

const FIELDS = ["sodra_insurer_code", "edas_username", "vmi_ws_username", "manager_name", "manager_position",
  "representation_basis", "contract_city", "workplace_address", "advance_enabled", "advance_day", "salary_day",
  "advance_percent", "payout_account"];

function Section({ title, hint, children }) {
  return (
    <Box>
      <Typography fontWeight={700}>{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary" mb={1.5}>{hint}</Typography>}
      {!hint && <Box mb={1.5} />}
      <Stack gap={2}>{children}</Stack>
    </Box>
  );
}

function PasswordInput({ value, onChange, isSet, helper }) {
  return (
    <TextField label="Slaptažodis" type="password" value={value} onChange={(e) => onChange(e.target.value)} fullWidth
      autoComplete="new-password" InputLabelProps={{ shrink: true }}
      placeholder={isSet ? "•••••••• (išsaugotas)" : ""}
      helperText={isSet ? "Palikite tuščią, jei nekeičiate" : helper || " "} />
  );
}

export default function PayrollSettingsDialog({ open, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState("");
  const [pw, setPw] = useState({ edas: "", vmi: "" });
  const [isSet, setIsSet] = useState({ edas: false, vmi: false });
  const [vmiTest, setVmiTest] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const set = (v) => setF((s) => ({ ...s, ...v }));

  useEffect(() => {
    if (!open) return;
    setError(""); setPw({ edas: "", vmi: "" }); setVmiTest(null);
    payrollApi.bankAccounts().then(setAccounts).catch(() => setAccounts([]));
    payrollApi.settings().then((s) => {
      setF(Object.fromEntries(FIELDS.map((k) => [k, s[k] ?? ""])));
      setIsSet({ edas: !!s.edas_password_set, vmi: !!s.vmi_ws_password_set });
    }).catch((e) => setError(apiError(e)));
  }, [open]);

  const persist = async () => {
    await payrollApi.saveSettings({
      ...f,
      ...(pw.edas ? { edas_password: pw.edas } : {}),
      ...(pw.vmi ? { vmi_ws_password: pw.vmi } : {}),
    });
    setIsSet((s) => ({ edas: s.edas || !!pw.edas, vmi: s.vmi || !!pw.vmi }));
    setPw({ edas: "", vmi: "" });
  };

  const save = async () => {
    try { await persist(); onSaved?.(); onClose(); } catch (e) { setError(apiError(e)); }
  };

  const testVmi = async () => {
    setVmiTest(null);
    try { await persist(); setVmiTest(await payrollApi.testVmi()); }
    catch (e) { setVmiTest({ ok: false, message: apiError(e) }); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" disableScrollLock>
      <DialogTitle sx={{ pr: 6 }}>
        Darbo užmokesčio nustatymai
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {f && (
          <Stack gap={3}>
            {/* ---------- Sodra ---------- */}
            <Section title="Sodra" hint="SAM, 1-SD ir 2-SD pranešimams.">
              <TextField label="Draudėjo kodas" value={f.sodra_insurer_code} inputProps={{ maxLength: 7, inputMode: "numeric" }}
                onChange={(e) => set({ sodra_insurer_code: e.target.value.replace(/\D/g, "") })}
                helperText="Iki 7 skaitmenų. Matomas EDAS arba bet kuriame pateiktame SAM / 1-SD" />
              <Typography variant="body2" color="text.secondary">
                Prisijungimas tiesioginiam teikimui. EDAS: Naudotojo nustatymai → pažymėkite
                „Naudoti pranešimų teikimo naudojant tinklinę sąsają paslaugą“ ir susikurkite slaptažodį.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                <TextField label="EDAS naudotojo vardas" value={f.edas_username} fullWidth autoComplete="off"
                  onChange={(e) => set({ edas_username: e.target.value.trim() })} />
                <PasswordInput value={pw.edas} onChange={(v) => setPw((s) => ({ ...s, edas: v }))} isSet={isSet.edas}
                  helper="10–14 simbolių, bent 1 skaičius ir 1 spec. simbolis" />
              </Stack>
              <Alert severity="info" sx={{ py: 0 }}>
                Tiesioginis teikimas į Sodrą bus įjungtas netrukus. Kol kas atsisiųskite .ffdata ir įkelkite į EDAS.
              </Alert>
            </Section>

            <Divider />

            {/* ---------- VMI ---------- */}
            <Section title="VMI" hint="GPM313 deklaracijai.">
              <Typography variant="body2" color="text.secondary">
                Prisijungimas tiesioginiam teikimui. EDS: Nustatymai → Mano duomenys → pažymėkite žiniatinklio
                paslaugą ir susikurkite atskirą vardą bei slaptažodį.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                <TextField label="EDS žiniatinklio naudotojo vardas" value={f.vmi_ws_username} fullWidth autoComplete="off"
                  onChange={(e) => set({ vmi_ws_username: e.target.value.trim() })} />
                <PasswordInput value={pw.vmi} onChange={(v) => setPw((s) => ({ ...s, vmi: v }))} isSet={isSet.vmi} />
              </Stack>
              <Stack direction="row" gap={1.5} alignItems="center">
                <Button size="small" variant="outlined" onClick={testVmi}
                  disabled={!f.vmi_ws_username || (!isSet.vmi && !pw.vmi)}>
                  Patikrinti ryšį
                </Button>
                {vmiTest && <Typography variant="body2" color={vmiTest.ok ? "success.main" : "error"}>{vmiTest.message}</Typography>}
              </Stack>
            </Section>

            <Typography variant="caption" color="text.secondary" mt={-1.5}>
              Slaptažodžiai saugomi užšifruoti. Po kelių klaidingų bandymų Sodra ir VMI blokuoja naudotoją.
            </Typography>

            <Divider />

            {/* ---------- Sutartys ---------- */}
            <Section title="Darbo sutartims">
              <TextField label="Vadovas (vardas, pavardė)" value={f.manager_name} onChange={(e) => set({ manager_name: e.target.value })} />
              <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                <TextField label="Vadovo pareigos" value={f.manager_position} onChange={(e) => set({ manager_position: e.target.value })}
                  fullWidth helperText="pvz. direktorius" />
                <TextField label="Atstovavimo pagrindas" value={f.representation_basis} onChange={(e) => set({ representation_basis: e.target.value })}
                  fullWidth helperText="pvz. įmonės įstatai" />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                <TextField label="Sutarčių sudarymo vieta" value={f.contract_city} onChange={(e) => set({ contract_city: e.target.value })}
                  fullWidth helperText="pvz. Vilnius" />
                <TextField label="Darbovietės adresas" value={f.workplace_address} onChange={(e) => set({ workplace_address: e.target.value })}
                  fullWidth helperText="Jei tuščia – įmonės buveinės adresas" />
              </Stack>
            </Section>

            <Divider />

            {/* ---------- Mokėjimas ---------- */}
            <Section title="Atlyginimo mokėjimas">
              <FormControlLabel control={<Switch checked={!!f.advance_enabled} onChange={(e) => set({ advance_enabled: e.target.checked })} />}
                label="Mokamas avansas (du kartus per mėnesį)" />
              <Stack direction="row" gap={2}>
                {f.advance_enabled && (
                  <TextField label="Avansas iki (einamojo mėn. diena)" type="number" value={f.advance_day}
                    onChange={(e) => set({ advance_day: e.target.value })} fullWidth />
                )}
                <TextField label="Atlyginimas iki (kito mėn. diena)" type="number" value={f.salary_day}
                  onChange={(e) => set({ salary_day: e.target.value })} fullWidth />
              </Stack>
              {f.advance_enabled && (
                <TextField label="Avanso dydis, % nuo grynojo atlyginimo" type="number" value={f.advance_percent}
                  onChange={(e) => set({ advance_percent: e.target.value })} inputProps={{ min: 1, max: 100 }}
                  helperText="Darbuotojo kortelėje galima nurodyti konkrečią avanso sumą" />
              )}
              <Typography variant="caption" color="text.secondary" mt={-1}>
                Pagal DK darbo užmokestis mokamas du kartus per mėnesį, nebent darbuotojas prašo mokėti kartą.
              </Typography>
              <TextField select label="Iš kurios sąskaitos mokama (numatytoji)" value={f.payout_account || ""}
                onChange={(e) => set({ payout_account: e.target.value })} SelectProps={{ MenuProps: { disableScrollLock: true } }}
                helperText="Siūloma žymint mokėjimus rankiniu būdu">
                <MenuItem value="">Nepasirinkta</MenuItem>
                {accounts.map((a) => <MenuItem key={a.key} value={a.account}>{a.label || a.bank} ({a.account}){a.iban ? ` · ${a.iban}` : ""}</MenuItem>)}
                <MenuItem value="2720">Kasa (2720)</MenuItem>
              </TextField>
            </Section>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Atšaukti</Button>
        <Button variant="contained" onClick={save} disabled={!f}>Išsaugoti</Button>
      </DialogActions>
    </Dialog>
  );
}
