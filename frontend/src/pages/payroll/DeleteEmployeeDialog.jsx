import { useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography,
} from "@mui/material";

import { api } from "../../api/endpoints";
import { apiError } from "../../api/payroll";

// Darbuotojo ištrynimas: tik jei nėra patvirtinto DU ir pateiktų Sodrai / VMI duomenų
export default function DeleteEmployeeDialog({ emp, open, onClose, onDeleted }) {
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !emp) return;
    setCheck(null); setError("");
    api.get(`payroll/employees/${emp.id}/delete-check/`)
      .then((r) => setCheck(r.data))
      .catch((e) => setError(apiError(e)));
  }, [open, emp]);

  const remove = async () => {
    setBusy(true); setError("");
    try {
      await api.delete(`payroll/employees/${emp.id}/`);
      onDeleted?.();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };

  const name = emp ? `${emp.first_name || ""} ${emp.last_name || ""}`.trim() : "";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth disableScrollLock>
      <DialogTitle sx={{ fontSize: 17, fontWeight: 600, pb: 1 }}>Ištrinti darbuotoją?</DialogTitle>
      <DialogContent>
        {!check && !error && <Box sx={{ py: 3, textAlign: "center" }}><CircularProgress size={26} /></Box>}
        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

        {check && !check.can_delete && (
          <>
            <Typography variant="body2" mb={1.5}>
              <b>{name}</b> ištrinti negalima:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, mb: 1.5 }}>
              {check.blockers.map((b) => <li key={b}><Typography variant="body2">{b}</Typography></li>)}
            </Box>
            <Alert severity="info">
              Jei darbuotojas nebedirba – jį atleiskite (kortelė → Sutartis → ⋯ → Atleisti).
              Apskaitos duomenys turi likti.
            </Alert>
          </>
        )}

        {check?.can_delete && (
          <>
            <Typography variant="body2" mb={1.5}>
              <b>{name}</b> ir visi jo duomenys bus ištrinti negrįžtamai.
            </Typography>
            {check.warnings?.length > 0 && (
              <>
                <Typography variant="body2" color="text.secondary" mb={0.5}>Kartu bus ištrinta:</Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {check.warnings.map((w) => <li key={w}><Typography variant="body2">{w}</Typography></li>)}
                </Box>
              </>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{check?.can_delete ? "Atšaukti" : "Uždaryti"}</Button>
        {check?.can_delete && (
          <Button variant="contained" color="error" onClick={remove} disabled={busy}>
            {busy ? "Trinama…" : "Ištrinti"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
