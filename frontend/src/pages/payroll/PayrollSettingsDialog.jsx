import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, IconButton, MenuItem, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import EuroOutlinedIcon from "@mui/icons-material/EuroOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";

import { apiError, payrollApi } from "../../api/payroll";
import SuminePeriodSection from "./SuminePeriodSection";
import DuStartSection from "./DuStartSection";

const FIELDS = ["sodra_insurer_code", "edas_username", "vmi_ws_username", "manager_name", "manager_position",
  "representation_basis", "contract_city", "workplace_address", "advance_enabled", "advance_day", "salary_day",
  "advance_percent", "payout_account", "summed_period_months", "summed_period_anchor", "du_start",
  "collective_agreement", "training_info", "social_protection_info"];

// sutarčiai būtini laukai (be jų sutarties negalima pažymėti pasirašyta)
const REQUIRED = [["manager_name", "atstovo vardas ir pavardė"], ["manager_position", "atstovo pareigos"],
  ["representation_basis", "atstovavimo pagrindas"]];

const TABS = [
  { v: "contracts", l: "Sutartys ir dokumentai", i: DescriptionOutlinedIcon,
    t: "Sutartys ir dokumentai", d: "Duomenys darbo sutartims ir pranešimams apie darbo sąlygas" },
  { v: "pay", l: "Darbo užmokestis", i: EuroOutlinedIcon,
    t: "Darbo užmokestis", d: "DU pradžia, mokėjimo tvarka ir suminė darbo laiko apskaita" },
  { v: "integrations", l: "Integracijos", i: HubOutlinedIcon,
    t: "Integracijos", d: "Tiesioginis pranešimų ir deklaracijų teikimas Sodrai ir VMI" },
];

const MENU_PROPS = { disableScrollLock: true };
const TEXT_OPTS = ["collective_agreement", "training_info", "social_protection_info"];
// seni klaidingi įrašai (false / "false") - tuščia
const cleanText = (v) => (typeof v === "string" && !["false", "true", "null", "undefined"].includes(v.trim().toLowerCase()) ? v : "");

// DK 44 str. papildomos sąlygos: jungiklis + paaiškinimas; įjungus - laukas aprašymui
const DK44_OPTS = [
  { k: "collective_agreement", title: "Kolektyvinė sutartis",
    tip: "Darbdavio (ar šakos) ir profesinės sąjungos susitarimas dėl darbo sąlygų. Mažose įmonėse paprastai nėra – palikite išjungtą.",
    off: "Netaikoma – pranešime: „Darbdaviui taikomų kolektyvinių sutarčių nėra“",
    label: "Pavadinimas ir kur su ja susipažinti", ph: "pvz. 2026 m. įmonės kolektyvinė sutartis, skelbiama intranete" },
  { k: "training_info", title: "Darbdavio teikiami mokymai",
    tip: "Įjunkite, jei darbdavys suteikia teisę į mokymus: apmoka kursus, kvalifikacijos kėlimą, sertifikavimą. Privalomi darbų saugos instruktažai čia nerašomi.",
    off: "Neteikiami – eilutė pranešime nerodoma",
    label: "Kokie mokymai ir kokia tvarka", ph: "pvz. kvalifikacijos kėlimo kursai iki 5 d. per metus darbo laiku" },
  { k: "social_protection_info", title: "Papildoma socialinė apsauga",
    tip: "Įjunkite, jei darbdavys moka papildomas garantijas virš privalomo Sodros draudimo: papildomas sveikatos ar gyvybės draudimas, įmokos į III pakopos pensijų fondą.",
    off: "Nėra – eilutė pranešime nerodoma",
    label: "Kokia apsauga ir kas ją teikia", ph: "pvz. papildomas sveikatos draudimas (draudimo bendrovė …) po išbandymo laikotarpio" },
];

function Tip({ title }) {
  return (
    <Tooltip arrow placement="top" enterTouchDelay={0}
      title={<Box sx={{ fontSize: 12.5, lineHeight: 1.5, p: .25, maxWidth: 300 }}>{title}</Box>}>
      <HelpOutlineIcon sx={{ fontSize: 16, color: "#98A2B3", ml: .5, verticalAlign: "-3px", cursor: "help", "&:hover": { color: "#475467" } }} />
    </Tooltip>
  );
}

function OptionalText({ o, value, on, onToggle, onChange }) {
  return (
    <Box sx={{ py: 1.25, borderTop: "1px solid #F2F4F7", "&:first-of-type": { borderTop: 0, pt: 0 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
        <Box>
          <Typography component="div" sx={{ fontSize: 13.5, color: "#101828" }}>{o.title}<Tip title={o.tip} /></Typography>
          {!on && <Typography sx={{ fontSize: 12, color: "#667085", mt: .2 }}>{o.off}</Typography>}
        </Box>
        <Switch size="small" checked={on} onChange={(e) => onToggle(e.target.checked)} />
      </Stack>
      {on && (
        <TextField size="small" fullWidth multiline maxRows={3} label={o.label} placeholder={o.ph} value={value}
          sx={{ mt: 1.25 }} inputProps={{ maxLength: 255 }} error={!value.trim()}
          helperText={!value.trim() ? "Įrašykite – kitaip pranešime ši sąlyga nebus nurodyta" : " "}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </Box>
  );
}

function Block({ title, hint, action, children }) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} mb={1.5}>
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#101828" }}>{title}</Typography>
          {hint && <Typography sx={{ fontSize: 12.5, color: "#667085", mt: .25 }}>{hint}</Typography>}
        </Box>
        {action}
      </Stack>
      <Stack gap={2}>{children}</Stack>
    </Box>
  );
}

function Card({ children }) {
  return <Box sx={{ border: "1px solid #EAECF0", borderRadius: 2.5, p: 2 }}>{children}</Box>;
}

function Status({ ok }) {
  return (
    <Chip size="small" label={ok ? "Prijungta" : "Neprijungta"}
      sx={{ fontWeight: 500, bgcolor: ok ? "#ECFDF3" : "#F2F4F7", color: ok ? "#027A48" : "#667085" }} />
  );
}

function PasswordInput({ value, onChange, isSet, helper }) {
  return (
    <TextField label="Slaptažodis" type="password" value={value} onChange={(e) => onChange(e.target.value)} fullWidth size="small"
      autoComplete="new-password" InputLabelProps={{ shrink: true }}
      placeholder={isSet ? "•••••••• (išsaugotas)" : ""}
      helperText={isSet ? "Palikite tuščią, jei nekeičiate" : helper || " "} />
  );
}

export default function PayrollSettingsDialog({ open, onClose, onSaved, tab: initialTab = "contracts" }) {
  const [f, setF] = useState(null);
  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState("");
  const [pw, setPw] = useState({ edas: "", vmi: "" });
  const [isSet, setIsSet] = useState({ edas: false, vmi: false });
  const [vmiTest, setVmiTest] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [savedPeriod, setSavedPeriod] = useState({});
  const [optOn, setOptOn] = useState({});           // DK 44 papildomų sąlygų jungikliai
  const set = (v) => setF((s) => ({ ...s, ...v }));

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setError(""); setPw({ edas: "", vmi: "" }); setVmiTest(null);
    payrollApi.bankAccounts().then(setAccounts).catch(() => setAccounts([]));
    payrollApi.settings().then((s) => {
      const texts = Object.fromEntries(TEXT_OPTS.map((k) => [k, cleanText(s[k])]));
      setF({ ...Object.fromEntries(FIELDS.map((k) => [k, s[k] ?? ""])), ...texts,
        summed_period_months: s.summed_period_months || 3, summed_period_anchor: s.summed_period_anchor || 1 });
      setOptOn(Object.fromEntries(TEXT_OPTS.map((k) => [k, !!texts[k].trim()])));
      setSavedPeriod({ m: s.summed_period_months || 3, a: s.summed_period_anchor || 1 });
      setIsSet({ edas: !!s.edas_password_set, vmi: !!s.vmi_ws_password_set });
    }).catch((e) => setError(apiError(e)));
  }, [open, initialTab]);

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

  const missing = f ? REQUIRED.filter(([k]) => !String(f[k] || "").trim()) : [];
  const sodraOk = !!(f?.edas_username && isSet.edas);
  const vmiOk = !!(f?.vmi_ws_username && isSet.vmi);
  const meta = TABS.find((x) => x.v === tab);

  const badge = (v) => {
    if (v === "contracts" && missing.length) return <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#F04438", ml: "auto" }} />;
    if (v === "integrations" && f) {
      return (
        <Box sx={{ ml: "auto", fontSize: 11, px: .9, borderRadius: 5, fontWeight: 500,
          bgcolor: sodraOk && vmiOk ? "#ECFDF3" : "#F2F4F7", color: sodraOk && vmiOk ? "#027A48" : "#667085" }}>
          {Number(sodraOk) + Number(vmiOk)} / 2
        </Box>
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" disableScrollLock
      PaperProps={{ sx: { borderRadius: 3, overflow: "hidden", height: { md: 680 }, maxHeight: "92vh" } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "230px minmax(0,1fr)" }, height: "100%", minHeight: 0 }}>
        {/* ---------- kairė: skirtukai ---------- */}
        <Box sx={{ bgcolor: "#F8FAFC", borderRight: { md: "1px solid #EAECF0" }, borderBottom: { xs: "1px solid #EAECF0", md: 0 },
          p: { xs: 1, md: 1.5 }, pt: { md: 2.5 } }}>
          <Box sx={{ px: 1, mb: 2, display: { xs: "none", md: "block" } }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: "#101828" }}>DU nustatymai</Typography>
          </Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} orientation="vertical" variant="scrollable"
            TabIndicatorProps={{ sx: { display: "none" } }}
            sx={{
              minHeight: 0,
              "& .MuiTabs-flexContainer": { gap: .25 },
              "& .MuiTab-root": {
                textTransform: "none", minHeight: 40, px: 1.25, py: 1, borderRadius: 2, justifyContent: "flex-start",
                alignItems: "center", fontSize: 13.5, color: "#344054", maxWidth: "none", border: "1px solid transparent",
                textAlign: "left", lineHeight: 1.3,
              },
              "& .MuiTab-root.Mui-selected": {
                bgcolor: "#FFFFFF", color: "#101828", fontWeight: 600, borderColor: "#EAECF0",
                boxShadow: "0 1px 2px rgba(16,24,40,.06)",
              },
            }}>
            {TABS.map(({ v, l, i: I }) => (
              <Tab key={v} value={v} iconPosition="start" disableRipple
                icon={<I sx={{ fontSize: 19, mr: "10px !important", color: tab === v ? "#1D4ED8" : "#98A2B3" }} />}
                label={<Stack direction="row" alignItems="center" sx={{ flex: 1, gap: 1 }}>{l}{badge(v)}</Stack>} />
            ))}
          </Tabs>
        </Box>

        {/* ---------- dešinė: turinys ---------- */}
        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <Box sx={{ px: 3, pt: 2.25, pb: 1.75, borderBottom: "1px solid #EAECF0", position: "relative" }}>
            <Typography sx={{ fontSize: 17, fontWeight: 600, color: "#101828", pr: 5 }}>{meta.t}</Typography>
            <Typography sx={{ fontSize: 13, color: "#667085", mt: .25, pr: 5 }}>{meta.d}</Typography>
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 14, top: 14 }} aria-label="Uždaryti"><CloseIcon /></IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5 }}>
            {!f ? (error && <Alert severity="error">{error}</Alert>) : (
              <Stack gap={3}>
                {/* ================= Sutartys ir dokumentai ================= */}
                {tab === "contracts" && (
                  <>
                    {missing.length > 0 && (
                      <Alert severity="warning" sx={{ py: .25 }}>
                        Neužpildyta: {missing.map(([, l]) => l).join(", ")} – be šių duomenų sutarties negalima pažymėti pasirašyta.
                      </Alert>
                    )}
                    <Block title="Darbdavio atstovas" hint="Kas pasirašo darbo sutartis įmonės vardu. Sutartyje: „…, kuriam atstovauja direktorė Vardenė Pavardenė (atstovavimo pagrindas – įmonės įstatai)“">
                      <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                        <TextField size="small" label="Vardas, pavardė" value={f.manager_name} fullWidth
                          error={!String(f.manager_name || "").trim()} onChange={(e) => set({ manager_name: e.target.value })} />
                        <TextField size="small" label="Pareigos" value={f.manager_position} fullWidth placeholder="pvz. direktorė"
                          helperText="Vardininku, pagal lytį: direktorius / direktorė"
                          error={!String(f.manager_position || "").trim()} onChange={(e) => set({ manager_position: e.target.value })} />
                      </Stack>
                      <TextField size="small" label="Atstovavimo pagrindas" value={f.representation_basis} placeholder="pvz. įmonės įstatai"
                        error={!String(f.representation_basis || "").trim()} sx={{ maxWidth: { sm: "calc(50% - 8px)" } }}
                        onChange={(e) => set({ representation_basis: e.target.value })} />
                    </Block>

                    <Block title="Sutarties vieta">
                      <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                        <TextField size="small" label="Sudarymo vieta" value={f.contract_city} fullWidth placeholder="pvz. Vilnius"
                          onChange={(e) => set({ contract_city: e.target.value })} />
                        <TextField size="small" label="Darbovietės adresas" value={f.workplace_address} fullWidth
                          helperText="Jei tuščia – įmonės buveinės adresas" onChange={(e) => set({ workplace_address: e.target.value })} />
                      </Stack>
                    </Block>

                    <Card>
                      <Block title="Papildomos sąlygos pranešimui apie darbo sąlygas"
                        hint="DK 44 str. Dažniausiai visos išjungtos – įjunkite tik tai, ką darbdavys tikrai taiko">
                        <Box>
                          {DK44_OPTS.map((o) => (
                            <OptionalText key={o.k} o={o} value={f[o.k] || ""} on={!!optOn[o.k]}
                              onToggle={(v) => { setOptOn((s) => ({ ...s, [o.k]: v })); if (!v) set({ [o.k]: "" }); }}
                              onChange={(v) => set({ [o.k]: v })} />
                          ))}
                        </Box>
                      </Block>
                    </Card>
                  </>
                )}

                {/* ================= Darbo užmokestis ================= */}
                {tab === "pay" && (
                  <>
                    <Block title="DU pradžia DokSkene" hint="Nuo kurio mėnesio atlyginimai skaičiuojami DokSkene">
                      <DuStartSection value={f.du_start} onChange={set} />
                    </Block>

                    <Card>
                      <Block title="Avansas (du kartus per mėnesį)"
                        hint="Pagal DK 139 str. – du kartus per mėnesį, nebent darbuotojas prašo kartą (žymima prie jo sutarties)"
                        action={<Switch checked={!!f.advance_enabled} onChange={(e) => set({ advance_enabled: e.target.checked })} />}>
                        {f.advance_enabled && (
                          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                            <TextField size="small" label="Avansas iki (einamojo mėn. diena)" type="number" value={f.advance_day} fullWidth
                              onChange={(e) => set({ advance_day: e.target.value })} />
                            <TextField size="small" label="Avanso dydis, % nuo grynojo" type="number" value={f.advance_percent} fullWidth
                              inputProps={{ min: 1, max: 100 }} helperText="Kortelėje galima nurodyti konkrečią sumą"
                              onChange={(e) => set({ advance_percent: e.target.value })} />
                          </Stack>
                        )}
                      </Block>
                    </Card>

                    <Block title="Atlyginimo mokėjimas">
                      <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                        <TextField size="small" label="Atlyginimas iki (kito mėn. diena)" type="number" value={f.salary_day} fullWidth
                          onChange={(e) => set({ salary_day: e.target.value })} />
                        <TextField size="small" select label="Numatytoji sąskaita" value={f.payout_account || ""} fullWidth
                          onChange={(e) => set({ payout_account: e.target.value })} SelectProps={{ MenuProps: MENU_PROPS }}
                          helperText="Siūloma žymint mokėjimus">
                          <MenuItem value="">Nepasirinkta</MenuItem>
                          {accounts.map((a) => <MenuItem key={a.key} value={a.account}>{a.label || a.bank} ({a.account}){a.iban ? ` · ${a.iban}` : ""}</MenuItem>)}
                          <MenuItem value="2720">Kasa (2720)</MenuItem>
                        </TextField>
                      </Stack>
                    </Block>

                    <Block title="Suminė darbo laiko apskaita" hint="Apskaitinis laikotarpis – per jį skaičiuojama valandų norma ir viršvalandžiai">
                      <SuminePeriodSection months={f.summed_period_months} anchor={f.summed_period_anchor}
                        savedMonths={savedPeriod.m} savedAnchor={savedPeriod.a} onChange={set} />
                    </Block>
                  </>
                )}

                {/* ================= Integracijos ================= */}
                {tab === "integrations" && (
                  <>
                    <Card>
                      <Block title="Sodra (EDAS)" hint="SAM, 1-SD, 2-SD, 9-SD, 12-SD, NP-SD2, SDUP" action={<Status ok={sodraOk} />}>
                        <TextField size="small" label="Draudėjo kodas" value={f.sodra_insurer_code} sx={{ maxWidth: { sm: "calc(50% - 8px)" } }}
                          inputProps={{ maxLength: 7, inputMode: "numeric" }}
                          onChange={(e) => set({ sodra_insurer_code: e.target.value.replace(/\D/g, "") })}
                          helperText="Iki 7 skaitmenų. Matomas EDAS arba bet kuriame pateiktame SAM / 1-SD" />
                        <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                          <TextField size="small" label="EDAS naudotojo vardas" value={f.edas_username} fullWidth autoComplete="off"
                            helperText=" " onChange={(e) => set({ edas_username: e.target.value.trim() })} />
                          <PasswordInput value={pw.edas} onChange={(v) => setPw((s) => ({ ...s, edas: v }))} isSet={isSet.edas}
                            helper="10–14 simbolių, bent 1 skaičius ir 1 spec. simbolis" />
                        </Stack>
                        <Typography sx={{ fontSize: 12, color: "#667085", mt: -1 }}>
                          EDAS: Naudotojo nustatymai → pažymėkite „Naudoti pranešimų teikimo naudojant tinklinę sąsają paslaugą“ ir susikurkite slaptažodį.
                        </Typography>
                        <Alert severity="info" sx={{ py: 0 }}>
                          Tiesioginis teikimas į Sodrą bus įjungtas netrukus. Kol kas atsisiųskite .ffdata ir įkelkite į EDAS.
                        </Alert>
                      </Block>
                    </Card>

                    <Card>
                      <Block title="VMI (EDS)" hint="GPM313, GPM312" action={<Status ok={vmiOk} />}>
                        <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                          <TextField size="small" label="EDS žiniatinklio naudotojas" value={f.vmi_ws_username} fullWidth autoComplete="off"
                            helperText=" " onChange={(e) => set({ vmi_ws_username: e.target.value.trim() })} />
                          <PasswordInput value={pw.vmi} onChange={(v) => setPw((s) => ({ ...s, vmi: v }))} isSet={isSet.vmi} />
                        </Stack>
                        <Typography sx={{ fontSize: 12, color: "#667085", mt: -1 }}>
                          EDS: Nustatymai → Mano duomenys → pažymėkite žiniatinklio paslaugą ir susikurkite atskirą vardą bei slaptažodį.
                        </Typography>
                        <Stack direction="row" gap={1.5} alignItems="center">
                          <Button size="small" variant="outlined" onClick={testVmi} sx={{ textTransform: "none" }}
                            disabled={!f.vmi_ws_username || (!isSet.vmi && !pw.vmi)}>
                            Patikrinti ryšį
                          </Button>
                          {vmiTest && <Typography variant="body2" color={vmiTest.ok ? "success.main" : "error"}>{vmiTest.message}</Typography>}
                        </Stack>
                      </Block>
                    </Card>

                    <Typography sx={{ fontSize: 12, color: "#667085" }}>
                      Slaptažodžiai saugomi užšifruoti. Po kelių klaidingų bandymų Sodra ir VMI blokuoja naudotoją.
                    </Typography>
                  </>
                )}

                {error && <Alert severity="error">{error}</Alert>}
              </Stack>
            )}
          </Box>

          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 3, py: 1.5, borderTop: "1px solid #EAECF0" }}>
            <Button onClick={onClose} sx={{ textTransform: "none" }}>Atšaukti</Button>
            <Button variant="contained" disableElevation onClick={save} disabled={!f} sx={{ textTransform: "none", fontWeight: 600 }}>
              Išsaugoti
            </Button>
          </Stack>
        </Box>
      </Box>
    </Dialog>
  );
}
