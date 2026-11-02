import { useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  TextField, Typography,
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { api } from "../api/endpoints";

const errText = (e) => e?.response?.data?.detail || e?.response?.data?.[0] || e?.message || "Klaida";

// Įmonės profilio archyvavimas arba ištrynimas (ištrinti - tik be apskaitos duomenų)
export default function CompanyManageDialog({ profile, open, onClose, onDone }) {
  const [check, setCheck] = useState(null);
  const [mode, setMode] = useState("choose");          // choose | delete
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(null);

  useEffect(() => {
    if (!open || !profile) return;
    setCheck(null); setMode("choose"); setConfirm(""); setError(""); setNotes(null);
    api.get(`/company-profiles/${profile.id}/delete-check/`)
      .then((r) => setCheck(r.data))
      .catch((e) => setError(errText(e)));
  }, [open, profile]);

  const archive = async () => {
    setBusy(true); setError("");
    try {
      const { data } = await api.post(`/company-profiles/${profile.id}/archive/`);
      setNotes(data?.notes || []);
      await onDone?.();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setError("");
    try {
      await api.delete(`/company-profiles/${profile.id}/`, { params: { confirm } });
      await onDone?.();
      onClose();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const nameOk = confirm.trim().toLowerCase() === (profile?.name || "").trim().toLowerCase();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth disableScrollLock>
      <DialogTitle sx={{ fontSize: 18, fontWeight: 700, pb: 0.5 }}>{profile?.name}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}

        {notes ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            Įmonė archyvuota. Atkurti galėsite Nustatymų puslapyje (Įmonės profilis → Archyvuotos įmonės).
            {notes.map((n) => <div key={n}>{n}</div>)}
          </Alert>
        ) : !check ? (
          <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={26} /></Box>
        ) : mode === "choose" ? (
          <>
            <Box sx={{ display: "flex", gap: 1.5, mt: 1.5 }}>
              <Inventory2OutlinedIcon sx={{ color: "#6B7280", mt: 0.25 }} />
              <Box>
                <Typography fontWeight={600}>Archyvuoti</Typography>
                <Typography variant="body2" color="text.secondary">
                  Įmonė dings iš įmonių sąrašo, bet visi jos duomenys liks. Mokami planai bus atšaukti apmokėto
                  laikotarpio pabaigoje, periodinės sąskaitos sustabdytos. Atkurti galėsite bet kada:
                  Skaitmenizavimas → Nustatymai → Įmonės profilis → Archyvuotos įmonės.
                </Typography>
              </Box>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <DeleteOutlineIcon sx={{ color: check.can_delete ? "#B42318" : "#D0D5DD", mt: 0.25 }} />
              <Box>
                <Typography fontWeight={600} color={check.can_delete ? "#B42318" : "text.disabled"}>Ištrinti visam laikui</Typography>
                {check.can_delete ? (
                  <Typography variant="body2" color="text.secondary">
                    Įmonė ir visi jos duomenys bus ištrinti negrįžtamai.
                  </Typography>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Negalima – įmonėje yra apskaitos duomenų, kuriuos privalu saugoti:
                    </Typography>
                    <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                      {check.blockers.map((b) => <li key={b}><Typography variant="body2">{b}</Typography></li>)}
                    </Box>
                  </>
                )}
              </Box>
            </Box>
          </>
        ) : (
          <>
            <Alert severity="warning" sx={{ mt: 1, mb: 2 }}>
              Šio veiksmo atšaukti negalėsite. Bus ištrinti visi įmonės duomenys.
            </Alert>
            <Typography variant="body2" mb={1}>
              Patvirtinimui įveskite įmonės pavadinimą: <b>{profile?.name}</b>
            </Typography>
            <TextField fullWidth size="small" autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {notes ? (
          <Button variant="contained" onClick={onClose}>Gerai</Button>
        ) : mode === "choose" ? (
          <>
            <Button onClick={onClose}>Atšaukti</Button>
            {check?.can_delete && (
              <Button color="error" onClick={() => setMode("delete")}>Ištrinti</Button>
            )}
            <Button variant="contained" onClick={archive} disabled={!check || busy}>
              {busy ? "Archyvuojama…" : "Taip, archyvuoti"}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setMode("choose")}>Atgal</Button>
            <Button variant="contained" color="error" onClick={remove} disabled={!nameOk || busy}>
              {busy ? "Trinama…" : "Ištrinti visam laikui"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
