import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import { ILT_COLORS } from "./IltBanner";
import { addMonthsPeriod, errorText, fmtEur, fmtPeriod, todayIso } from "./fixedAssetsUtils";

const headCellSx = { fontWeight: 600, bgcolor: "#f3f4f6" };

export default function FixedAssetDepreciationPanel({ activeId, onChanged, onOpenAsset }) {
  const [period, setPeriod] = useState(() => addMonthsPeriod(todayIso(), -1));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeId || !/^\d{4}-\d{2}$/.test(period)) return;
    setLoading(true);
    setError("");
    try {
      const { data: res } = await fixedAssetsApi.getDepreciation(period);
      setData(res);
    } catch (e) {
      setError(errorText(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeId, period]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, question) => {
    if (!window.confirm(question)) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      await onChanged?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.rows || [];
  const errors = data?.errors || [];
  const warnings = data?.warnings || [];
  const lastRegistered = data?.last_registered ? fmtPeriod(data.last_registered) : null;

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2,
          bgcolor: ILT_COLORS.bg,
          border: `1px solid ${ILT_COLORS.border}`,
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <TextField
          label="Periodas"
          type="month"
          size="small"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ bgcolor: "#fff", width: 180 }}
        />

        <Typography sx={{ fontSize: 13, color: ILT_COLORS.text }}>
          Paskutinis užregistruotas: <b>{lastRegistered || "—"}</b>
        </Typography>

        {lastRegistered && (
          <Button
            size="small"
            onClick={() => setPeriod(addMonthsPeriod(lastRegistered, 1))}
            sx={{ textTransform: "none", color: "#A0590F" }}
          >
            Kitas periodas →
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        {data?.registered ? (
          <Button
            variant="outlined"
            color="error"
            disabled={busy || loading}
            onClick={() =>
              run(
                () => fixedAssetsApi.cancelDepreciation(period),
                `Atšaukti ${period} nusidėvėjimą? DK įrašas bus pašalintas.`,
              )
            }
            sx={{ textTransform: "none" }}
          >
            Atšaukti registravimą
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={busy || loading || rows.length === 0 || errors.length > 0}
            onClick={() =>
              run(
                () => fixedAssetsApi.registerDepreciation(period),
                `Užregistruoti ${period} nusidėvėjimą ${fmtEur(data?.total)}?`,
              )
            }
            sx={{
              textTransform: "none",
              borderRadius: 3,
              background: "linear-gradient(135deg, #FF9800, #F57C00)",
            }}
          >
            {busy ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : "Registruoti"}
          </Button>
        )}
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {errors.map((msg) => (
        <Alert key={msg} severity="error" sx={{ mb: 1 }}>{msg}</Alert>
      ))}
      {warnings.map((msg) => (
        <Alert key={msg} severity="warning" sx={{ mb: 1 }}>{msg}</Alert>
      ))}
      {data?.registered && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {period} nusidėvėjimas užregistruotas: {fmtEur(data.total)}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : rows.length === 0 ? (
        errors.length === 0 && (
          <Typography sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
            Šiam periodui nusidėvėjimo skaičiuoti nereikia
          </Typography>
        )
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Inv. nr.</TableCell>
                <TableCell sx={headCellSx}>Pavadinimas</TableCell>
                <TableCell sx={headCellSx}>Grupė</TableCell>
                <TableCell sx={headCellSx}>Laikotarpis</TableCell>
                <TableCell sx={headCellSx} align="right">Nusidėvėjimas</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.asset_id} hover>
                  <TableCell sx={{ fontSize: 13 }}>{r.inventory_number || "—"}</TableCell>
                  <TableCell sx={{ fontSize: 13 }}>
                    <Typography
                      component="span"
                      onClick={() => onOpenAsset?.(r.asset_id)}
                      sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "primary.main",
                        cursor: "pointer",
                        "&:hover": { textDecoration: "underline" },
                      }}
                    >
                      {r.name}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{r.group}</TableCell>
                  <TableCell sx={{ fontSize: 13 }}>
                    {r.catch_up_months > 0 ? (
                      <Tooltip
                        title={r.months
                          .map((m) => `${fmtPeriod(m.period)}: ${fmtEur(m.amount)}`)
                          .join(" · ")}
                      >
                        <Chip
                          label={`+${r.catch_up_months} praleisti mėn.`}
                          size="small"
                          sx={{
                            bgcolor: ILT_COLORS.bg,
                            color: ILT_COLORS.title,
                            border: `1px solid ${ILT_COLORS.border}`,
                            fontWeight: 600,
                          }}
                        />
                      </Tooltip>
                    ) : (
                      period
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, fontWeight: 600 }} align="right">
                    {fmtEur(r.amount)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} sx={{ fontWeight: 700 }}>
                  Iš viso ({rows.length} turto vnt.)
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmtEur(data?.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}