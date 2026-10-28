import { forwardRef, useCallback, useEffect, useState } from "react";
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemIcon,
  ListItemText, Paper, Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import { api } from "../../api/endpoints";
import { useCompanyProfiles } from "../../contexts/useCompanyProfiles";

// „Papildyti“ puslapio DU plano skiltis (#du). Rodoma tik DokSkenas ERP įmonei, kai DU mokėjimai įjungti.
const URL = "payroll/subscription/";
const C = {
  text: "#111827", muted: "#6b7280", border: "#e5e7eb", accent: "#f5be0d", accentDark: "#d89d00",
  okSoft: alpha("#4caf50", 0.12), okBorder: alpha("#4caf50", 0.24), okText: "#2e7d32", danger: "#d32f2f",
};
const fmtDate = (d) => (d ? String(d).slice(0, 10) : "");

const FEATURES = [
  "DU skaičiavimas ir tvirtinimas – neribotai",
  "Algalapiai ir darbuotojų savitarna (esavitarna.lt)",
  "SAM, GPM313, 1-SD, 2-SD, 9-SD, 12-SD, NP-SD2 ir GPM312 deklaracijos",
  "Atostoginiai, ligos išmokos, kompensacijos ir išeitinės",
  "Darbo grafikai, suminė apskaita ir tabelis",
  "Komandiruotės ir dienpinigiai",
  "Mokėjimų failai bankui ir išmokėjimų susiejimas",
  "Perėjimas iš kitos programos",
];
const TIERS = [
  ["Iki 10 darbuotojų", "20 € / mėn."],
  ["Nuo 11 iki 100 darbuotojų", "+2 € už kiekvieną"],
  ["Nuo 101 darbuotojo", "+1 € už kiekvieną"],
];

const btn = {
  py: 1.4, borderRadius: "14px", fontWeight: 700, fontSize: 15, textTransform: "none", boxShadow: "none",
};

const DuPlanSection = forwardRef(function DuPlanSection({ showMsg }, ref) {
  const { activeProfile } = useCompanyProfiles();
  const isErp = activeProfile?.accounting_program === "dokskenas_erp";
  const [a, setA] = useState(null);
  const [busy, setBusy] = useState("");
  const [cancelDialog, setCancelDialog] = useState(false);

  const load = useCallback(() => api.get(URL).then((r) => { setA(r.data); return r.data; }).catch(() => null), []);
  useEffect(() => { if (isErp) load(); }, [isErp, load]);

  // grįžus iš Stripe - laukiame, kol webhook aktyvuos planą
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("du_canceled")) showMsg?.("Mokėjimas atšauktas.", "error");
    if (!q.get("du_success") || !isErp) return undefined;
    showMsg?.("Ačiū! Mokėjimas gautas – DU planas aktyvuojamas.");
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      const d = await load();
      if (d?.state === "active" || n >= 10) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [isErp]); // eslint-disable-line react-hooks/exhaustive-deps

  // /papildyti#du - nuslinkti, kai skiltis atsiranda (būsena užkraunama asinchroniškai)
  const visible = isErp && a?.enabled && a.state !== "free";
  useEffect(() => {
    if (visible && window.location.hash === "#du") {
      setTimeout(() => document.getElementById("du")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  }, [visible]);

  const act = async (action, okMsg) => {
    setBusy(action);
    try {
      const { data } = await api.post(URL, { action });
      if (data?.url) { window.location.href = data.url; return; }
      setA(data);
      if (okMsg) showMsg?.(okMsg(data));
    } catch (e) {
      const d = e?.response?.data;
      showMsg?.((Array.isArray(d) ? d.join(" ") : d?.detail) || "Nepavyko", "error");
    } finally {
      setBusy("");
    }
  };

  if (!visible) return null;
  const paid = a.has_subscription && (a.state === "active" || a.state === "past_due");
  const end = fmtDate(a.current_period_end);

  return (
    <Box ref={ref} id="du" sx={{ maxWidth: 1180, mx: "auto", mt: { xs: 8, md: 10 }, scrollMarginTop: "24px" }}>
      <Box sx={{ textAlign: "center", mb: { xs: 4, md: 5 } }}>
        <Typography variant="h2" sx={{ fontSize: { xs: "30px", md: "40px" }, fontWeight: 800, letterSpacing: "-0.03em",
          color: C.text, mb: 1.25, lineHeight: 1.1 }}>
          Darbo užmokesčio planas
        </Typography>
        <Typography sx={{ fontSize: { xs: "16px", md: "18px" }, color: C.muted, maxWidth: 720, mx: "auto", lineHeight: 1.6 }}>
          Mokate tik už aktyvius darbuotojus · {activeProfile?.name}
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3, maxWidth: 1060, mx: "auto" }}>
        {/* Kaina */}
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: "24px", border: `1px solid ${C.border}`, bgcolor: "#fff" }}>
          <Typography sx={{ fontWeight: 800, fontSize: 20, color: C.text, mb: 2 }}>Jūsų kaina</Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", mb: 0.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: "38px", sm: "42px" }, color: C.text, lineHeight: 1, letterSpacing: "-0.03em" }}>
              €{a.price}
            </Typography>
            <Typography sx={{ ml: 0.75, color: C.muted, fontSize: 16 }}>/ mėn. be PVM</Typography>
          </Box>
          <Typography sx={{ fontSize: 14, color: C.muted, mb: 2.5 }}>
            {a.employees
              ? `Dabar įmonėje ${a.employees} aktyv${a.employees === 1 ? "us darbuotojas" : "ūs darbuotojai"}`
              : "Kol kas aktyvių darbuotojų nėra – taikoma minimali kaina"}
          </Typography>
          <Box sx={{ border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden", mb: 2 }}>
            {TIERS.map(([k, v], i) => (
              <Box key={k} sx={{ display: "flex", justifyContent: "space-between", px: 2, py: 1.25, gap: 2,
                borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <Typography sx={{ fontSize: 14, color: C.text }}>{k}</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{v}</Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Aktyvus darbuotojas – kurio darbo sutartis galiojo bent vieną mėnesio dieną. Darbuotojų skaičius
            atnaujinamas automatiškai prieš kiekvieną mokėjimą – priėmus naujų, mėnesio viduryje nieko nepriskaičiuojama.
          </Typography>
          <Typography sx={{ fontSize: 13, color: C.muted, lineHeight: 1.6, mt: 1 }}>
            Visada nemokamai: darbuotojų kortelės, darbo sutartys, DAS ir SDUP.
          </Typography>
        </Paper>

        {/* Funkcijos ir veiksmas */}
        <Paper elevation={0} sx={{
          p: { xs: 2.5, sm: 3.5 }, borderRadius: "24px", border: `1px solid ${alpha(C.accent, 0.45)}`,
          background: "linear-gradient(180deg, rgba(245,190,13,0.18) 0%, rgba(245,190,13,0.05) 30%, #fff 55%)",
          boxShadow: "0 28px 68px rgba(17, 24, 39, 0.13)", display: "flex", flexDirection: "column",
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center",
              bgcolor: alpha(C.accent, 0.14) }}>
              <BadgeOutlinedIcon sx={{ color: C.accentDark }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 24, color: C.text }}>Pilnas DU</Typography>
            {a.state === "trial" && <Chip size="small" label={`Bandomasis iki ${fmtDate(a.trial_ends_at)}`}
              sx={{ ml: "auto", fontWeight: 700, bgcolor: alpha(C.accent, 0.15), color: C.accentDark }} />}
          </Box>

          <List disablePadding sx={{ flexGrow: 1 }}>
            {FEATURES.map((f) => (
              <ListItem key={f} disableGutters sx={{ py: 0.6, alignItems: "flex-start" }}>
                <ListItemIcon sx={{ minWidth: 30, mt: 0.25 }}><CheckIcon sx={{ color: C.accentDark, fontSize: 18 }} /></ListItemIcon>
                <ListItemText primary={f} primaryTypographyProps={{ fontSize: 15, lineHeight: 1.5, color: C.text }} />
              </ListItem>
            ))}
          </List>

          {paid ? (
            <Box sx={{ mt: 3 }}>
              <Box sx={{ p: 2, borderRadius: "16px", mb: 1.5, bgcolor: a.state === "past_due" ? alpha(C.danger, 0.08) : C.okSoft,
                border: `1px solid ${a.state === "past_due" ? alpha(C.danger, 0.25) : C.okBorder}` }}>
                <Typography sx={{ color: a.state === "past_due" ? C.danger : C.okText, fontWeight: 700, fontSize: 15, mb: 0.5 }}>
                  {a.state === "past_due" ? "Nepavyko nuskaičiuoti mokėjimo" : "✓ DU planas aktyvus"}
                </Typography>
                <Typography sx={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
                  {a.cancel_at_period_end
                    ? `Planas atšauktas. Pilnas DU planas galios iki ${end}.`
                    : `Sekantis apmokėjimas: ${end}${a.billed_employees ? ` (${a.billed_employees} darb.)` : ""}`}
                </Typography>
              </Box>
              {a.cancel_at_period_end ? (
                <Button fullWidth variant="contained" disabled={!!busy}
                  onClick={() => act("resume", () => "DU planas atnaujintas.")}
                  sx={{ ...btn, bgcolor: C.accent, color: "#111", "&:hover": { bgcolor: C.accentDark, boxShadow: "none" } }}>
                  {busy === "resume" ? "Vykdoma…" : "Atnaujinti planą"}
                </Button>
              ) : (
                <Button fullWidth variant="text" disabled={!!busy} onClick={() => setCancelDialog(true)}
                  sx={{ color: C.muted, fontSize: 13, fontWeight: 600, textTransform: "none", borderRadius: "12px",
                    "&:hover": { color: C.danger, bgcolor: alpha(C.danger, 0.06) } }}>
                  {busy === "cancel" ? "Atšaukiama..." : "Atšaukti planą"}
                </Button>
              )}
              <Button fullWidth variant="text" disabled={!!busy} onClick={() => act("portal")}
                sx={{ color: C.muted, fontSize: 13, fontWeight: 600, textTransform: "none", borderRadius: "12px", mt: 0.5 }}>
                Mokėjimo kortelė ir sąskaitos
              </Button>
            </Box>
          ) : (
            <Box sx={{ mt: 3 }}>
              {a.state === "trial" && (
                <Typography sx={{ fontSize: 13, color: C.muted, mb: 1.25, textAlign: "center" }}>
                  Įsigijus dabar, mokėti pradėsite tik pasibaigus bandomajam laikotarpiui ({fmtDate(a.trial_ends_at)})
                </Typography>
              )}
              <Button fullWidth variant="contained" disabled={!!busy} onClick={() => act("checkout")}
                sx={{ ...btn, bgcolor: C.accent, color: "#111", "&:hover": { bgcolor: C.accentDark, boxShadow: "none" },
                  "&.Mui-disabled": { bgcolor: alpha(C.accent, 0.45), color: alpha("#111", 0.6) } }}>
                {busy === "checkout" ? "Vykdoma…" : `Įsigyti – €${a.price} / mėn.`}
              </Button>
            </Box>
          )}
        </Paper>
      </Box>

      <Dialog open={cancelDialog} onClose={() => setCancelDialog(false)} maxWidth="xs" fullWidth disableScrollLock
        PaperProps={{ sx: { borderRadius: "22px", p: 0.5, boxShadow: "none", border: `1px solid ${C.border}` } }}>
        <DialogTitle sx={{ pt: 3, px: 3, pb: 1, fontWeight: 800, fontSize: 22, color: C.text }}>Atšaukti DU planą?</DialogTitle>
        <DialogContent sx={{ px: 3, pb: 1 }}>
          <Typography sx={{ color: C.muted, fontSize: 15, lineHeight: 1.7 }}>
            Pilnu DU planu galėsite naudotis iki {end}. Po to DU tvirtinimas ir grafikų skelbimas bus užrakinti,
            o duomenys, skaičiavimai, DAS ir SDUP liks prieinami.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1.5, gap: 1 }}>
          <Button onClick={() => setCancelDialog(false)} sx={{ color: C.muted, textTransform: "none", fontWeight: 700, borderRadius: "12px", px: 2 }}>
            Grįžti
          </Button>
          <Button variant="contained"
            onClick={() => { setCancelDialog(false); act("cancel", (d) => `DU planas atšauktas. Pilnas DU galios iki ${fmtDate(d.current_period_end)}.`); }}
            sx={{ bgcolor: C.danger, textTransform: "none", fontWeight: 700, borderRadius: "12px", px: 2, boxShadow: "none",
              "&:hover": { bgcolor: "#b71c1c", boxShadow: "none" } }}>
            Atšaukti planą
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default DuPlanSection;
