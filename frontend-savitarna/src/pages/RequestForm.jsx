import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import { useNavigate, useParams } from "react-router-dom";

import { api, apiError, days } from "../api";
import LtDatePicker from "../components/LtDatePicker";

const TITLES = {
  vacation: {
    title: "Noriu atostogų",
    hint: "Pasirinkite pirmą ir paskutinę atostogų dieną.",
  },
  parent_day: {
    title: "Mamadienis / tėvadienis",
    hint: "Pasirinkite dieną. Jei priklauso 2 dienos – galite pasirinkti dvi iš eilės.",
  },
  unpaid: {
    title: "Nemokamos atostogos",
    hint: "Už šias dienas atlyginimas nemokamas.",
  },
  dismissal: {
    title: "Noriu išeiti iš darbo",
    hint: "Nurodykite paskutinę darbo dieną. Pagal DK apie išėjimą įspėjama prieš 20 kalendorinių dienų.",
  },
  pay_info: {
    title: "Informacija apie mano atlyginimą",
    hint: "Turite teisę sužinoti savo vidutinį valandinį atlyginimą ir vidutinį vyrų bei moterų atlyginimą savo pareigybių grupėje. Kolegų atskirų atlyginimų nematysite. Darbdavys atsakys per 2 mėnesius.",
  },
};

const today = () => new Date().toISOString().slice(0, 10);

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

function BackButton({ onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        border: 0,
        bgcolor: "transparent",
        p: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.25,
        color: "text.secondary",
        cursor: "pointer",
        font: "inherit",
        fontSize: "0.8rem",
        fontWeight: 600,
        width: "fit-content",
      }}
    >
      <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
      Atgal
    </Box>
  );
}

function FieldLabel({ children }) {
  return (
    <Typography
      sx={{
        mb: 0.7,
        fontSize: "0.8rem",
        lineHeight: 1.3,
        fontWeight: 650,
        color: "text.primary",
      }}
    >
      {children}
    </Typography>
  );
}

export default function RequestForm() {
  const { kind } = useParams();
  const meta = TITLES[kind] || TITLES.vacation;
  const single = kind === "dismissal";
  const noDates = kind === "pay_info";

  const [start, setStart] = useState(
    kind === "dismissal"
      ? addDays(today(), 20)
      : kind === "pay_info"
        ? today()
        : ""
  );

  const [end, setEnd] = useState(
    kind === "dismissal"
      ? addDays(today(), 20)
      : kind === "pay_info"
        ? today()
        : ""
  );

  const [comment, setComment] = useState("");
  const [pd, setPd] = useState(null);
  const [pre, setPre] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  // Mamadieniai: kiek liko šį laikotarpį; jei išnaudota - siūloma pirma galima data
  useEffect(() => {
    if (kind !== "parent_day") return;
    api
      .get("home/")
      .then((r) => {
        const p = r.data.parent_days;
        setPd(p);
        if (p?.days > 0 && p.remaining === 0 && p.next_period_start) {
          setStart((s) => s || p.next_period_start);
          setEnd((e) => e || p.next_period_start);
        }
      })
      .catch(() => {});
  }, [kind]);

  const ltd = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
  const exhausted = kind === "parent_day" && pd?.remaining === 0;
  const minStart = exhausted && pd?.next_period_start > today() ? pd.next_period_start : today();
  const showEnd = kind !== "parent_day" || (pd?.days || 0) >= 2;
  const hint = kind === "parent_day" && pd?.days === 1 ? "Pasirinkite dieną." : meta.hint;

  useEffect(() => {
    if (!start || !end) {
      setPre(null);
      return;
    }

    const t = setTimeout(() => {
      api
        .post("requests/preview/", {
          kind,
          start_date: start,
          end_date: end,
        })
        .then((r) => setPre(r.data))
        .catch(() => setPre(null));
    }, 250);

    return () => clearTimeout(t);
  }, [kind, start, end]);

  const submit = async () => {
    setBusy(true);
    setError("");

    try {
      await api.post("requests/", {
        kind,
        start_date: start,
        end_date: end,
        comment,
      });

      nav("/", {
        replace: true,
        state: { sent: true },
      });
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const blocked = !start || !end || pre?.errors?.length > 0;

  return (
    <Stack gap={2.1}>
      <BackButton onClick={() => nav(-1)} />

      <Box>
        <Typography
          component="h1"
          sx={{
            fontSize: "1.28rem",
            lineHeight: 1.25,
            fontWeight: 750,
            color: "#1F2937",
          }}
        >
          {meta.title}
        </Typography>

        <Typography
          sx={{
            mt: 0.55,
            fontSize: "0.78rem",
            lineHeight: 1.5,
            color: "text.secondary",
          }}
        >
          {hint}
        </Typography>
      </Box>

      {kind === "parent_day" && pd?.days > 0 && pd.remaining != null && (
        <Alert
          severity={exhausted ? "warning" : "info"}
          sx={{ borderRadius: "9px", "& .MuiAlert-message": { fontSize: "0.8rem" } }}
        >
          Jums priklauso {pd.days} d. {pd.period_months === 1 ? "per mėnesį" : "per ketvirtį"}.{" "}
          {pd.used?.length > 0 && <>Panaudota: {pd.used.map(ltd).join(", ")}. </>}
          {pd.pending?.length > 0 && <>Laukia patvirtinimo: {pd.pending.map(ltd).join(", ")}. </>}
          {exhausted ? (
            <b>Šiam laikotarpiui išnaudota – kitą dieną galite pasirinkti nuo {ltd(pd.next_period_start)}.</b>
          ) : (
            <b>{pd.period_label[0].toUpperCase() + pd.period_label.slice(1)} liko {pd.remaining} d.</b>
          )}
        </Alert>
      )}

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: "10px",
          bgcolor: "#fff",
        }}
      >
        <Stack gap={1.8}>
          {!noDates && (
            <Box>
              <Stack
                direction="row"
                alignItems="center"
                gap={0.7}
                sx={{ mb: 1.15 }}
              >
                <CalendarMonthOutlinedIcon
                  sx={{ fontSize: 19, color: "primary.main" }}
                />
                <Typography
                  sx={{
                    fontSize: "0.84rem",
                    fontWeight: 750,
                    color: "#1F2937",
                  }}
                >
                  Data
                </Typography>
              </Stack>

              {single ? (
                <Box>
                  <FieldLabel>Paskutinė darbo diena</FieldLabel>
                  <LtDatePicker
                    label=""
                    value={end}
                    minDate={today()}
                    onChange={(value) => {
                      setEnd(value);
                      setStart(value);
                    }}
                  />
                </Box>
              ) : (
                <Stack gap={1.5}>
                  <Box>
                    <FieldLabel>
                      {kind === "parent_day" ? "Diena" : "Nuo"}
                    </FieldLabel>
                    <LtDatePicker
                      label=""
                      value={start}
                      minDate={minStart}
                      onChange={(value) => {
                        setStart(value);

                        if (
                          !end ||
                          end < value ||
                          kind === "parent_day"
                        ) {
                          setEnd(value);
                        }
                      }}
                    />
                  </Box>

                  {showEnd && (
                    <Box>
                      <FieldLabel>
                        {kind === "parent_day"
                          ? "Iki (jei 2 dienos)"
                          : "Iki (imtinai)"}
                      </FieldLabel>
                      <LtDatePicker
                        label=""
                        value={end}
                        minDate={start || minStart}
                        onChange={setEnd}
                      />
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          )}

          {!noDates && <Divider />}

          <Box>
            <Stack
              direction="row"
              alignItems="center"
              gap={0.7}
              sx={{ mb: 1.05 }}
            >
              <NotesOutlinedIcon
                sx={{ fontSize: 19, color: "primary.main" }}
              />
              <Typography
                sx={{
                  fontSize: "0.84rem",
                  fontWeight: 750,
                  color: "#1F2937",
                }}
              >
                Pastaba
              </Typography>
            </Stack>

            <TextField
              fullWidth
              size="small"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Nebūtina"
              multiline
              minRows={2}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "10px",
                  fontSize: "0.86rem",
                  alignItems: "flex-start",
                },
              }}
            />
          </Box>
        </Stack>
      </Paper>

      {pre && !single && !noDates && (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: "10px",
            bgcolor: "#F8FAFC",
          }}
        >
          <Typography
            sx={{
              mb: 1.1,
              fontSize: "0.82rem",
              fontWeight: 750,
              color: "#1F2937",
            }}
          >
            Prašymo santrauka
          </Typography>

          <Stack gap={0.75}>
            <Stack
              direction="row"
              justifyContent="space-between"
              gap={2}
            >
              <Typography
                sx={{ fontSize: "0.78rem", color: "text.secondary" }}
              >
                Darbo dienų
              </Typography>
              <Typography sx={{ fontSize: "0.8rem", fontWeight: 700 }}>
                {days(pre.work_days)}
              </Typography>
            </Stack>

            {pre.balance != null && (
              <>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  gap={2}
                >
                  <Typography
                    sx={{ fontSize: "0.78rem", color: "text.secondary" }}
                  >
                    Priklauso
                  </Typography>
                  <Typography sx={{ fontSize: "0.8rem" }}>
                    {days(pre.balance)}
                  </Typography>
                </Stack>

                <Stack
                  direction="row"
                  justifyContent="space-between"
                  gap={2}
                >
                  <Typography
                    sx={{ fontSize: "0.78rem", color: "text.secondary" }}
                  >
                    Liks
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color:
                        Number(pre.remaining) < 0
                          ? "warning.main"
                          : "success.main",
                    }}
                  >
                    {days(pre.remaining)}
                  </Typography>
                </Stack>
              </>
            )}
          </Stack>
        </Paper>
      )}

      {pre?.errors?.map((e, i) => (
        <Alert
          key={i}
          severity="error"
          sx={{
            borderRadius: "9px",
            "& .MuiAlert-message": { fontSize: "0.8rem" },
          }}
        >
          {e}
        </Alert>
      ))}

      {pre?.warnings?.map((e, i) => (
        <Alert
          key={i}
          severity="warning"
          sx={{
            borderRadius: "9px",
            "& .MuiAlert-message": { fontSize: "0.8rem" },
          }}
        >
          {e}
        </Alert>
      ))}

      {error && (
        <Alert
          severity="error"
          sx={{
            borderRadius: "9px",
            "& .MuiAlert-message": { fontSize: "0.8rem" },
          }}
        >
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        disableElevation
        disabled={busy || blocked}
        onClick={submit}
        sx={{
          minHeight: 46,
          borderRadius: "10px",
          fontSize: "0.9rem",
          fontWeight: 700,
          textTransform: "none",
        }}
      >
        {busy ? "Pateikiama…" : "Pateikti prašymą"}
      </Button>

      <Typography
        sx={{
          mt: -0.5,
          px: 1,
          textAlign: "center",
          fontSize: "0.7rem",
          lineHeight: 1.4,
          color: "text.secondary",
        }}
      >
        Prašymą gaus darbdavys. Apie sprendimą pranešime el. paštu.
      </Typography>
    </Stack>
  );
}
