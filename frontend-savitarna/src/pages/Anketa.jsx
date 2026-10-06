import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import FamilyRestroomOutlinedIcon from "@mui/icons-material/FamilyRestroomOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import { useNavigate } from "react-router-dom";

import { api, apiError } from "../api";
import { useAuth } from "../auth";
import LtDatePicker from "../components/LtDatePicker";

const emptyChild = () => ({ first_name: "", birth_date: "", has_disability: false });

const cardSx = {
  p: { xs: 2, sm: 2.25 },
  borderRadius: 1.5,
  borderColor: "#E4E9F0",
  bgcolor: "#fff",
  boxShadow: "0 4px 18px rgba(15, 23, 42, 0.035)",
};

const inputSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 44,
    borderRadius: 1.25,
    bgcolor: "#fff",
    fontSize: "0.9rem",
    "& fieldset": { borderColor: "#D8DEE8" },
    "&:hover fieldset": { borderColor: "#BFC8D6" },
  },
  "& .MuiInputBase-input": {
    py: 1.15,
  },
  "& .MuiFormHelperText-root": {
    mx: 0,
    mt: 0.55,
    fontSize: "0.7rem",
    lineHeight: 1.35,
  },
};

function BackButton({ onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        border: 0, bgcolor: "transparent", p: 0, display: "inline-flex", alignItems: "center", gap: 0.25,
        color: "text.secondary", cursor: "pointer", font: "inherit", fontSize: "0.8rem", fontWeight: 600, width: "fit-content",
      }}
    >
      <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
      Atgal
    </Box>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <Stack direction="row" alignItems="center" gap={1.15}>
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: 1.25,
          bgcolor: "#EEF5FF",
          color: "#1476ff",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          "& svg": { fontSize: 21 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: "1rem", fontWeight: 800, lineHeight: 1.2, color: "#101828" }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ mt: 0.25, fontSize: "0.76rem", lineHeight: 1.35, color: "#7A8496" }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

function Field({ label, optional, children }) {
  return (
    <Box>
      <Typography sx={{ mb: 0.65, fontSize: "0.76rem", fontWeight: 650, lineHeight: 1.25, color: "#344054" }}>
        {label}
        {optional && (
          <Box component="span" sx={{ fontWeight: 400, color: "#98A2B3" }}>
            {" "}(nebūtina)
          </Box>
        )}
      </Typography>
      {children}
    </Box>
  );
}

function YesNo({ value, onChange, disabled, compact = false }) {
  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      value={value === null ? null : value ? "yes" : "no"}
      disabled={disabled}
      onChange={(_, v) => v && onChange(v === "yes")}
      sx={{
        "& .MuiToggleButton-root": {
          minHeight: compact ? 38 : 42,
          py: 0.6,
          textTransform: "none",
          fontSize: compact ? "0.78rem" : "0.84rem",
          fontWeight: 700,
          color: "#667085",
          borderColor: "#D8DEE8",
          "&.Mui-selected": {
            color: "#1476ff",
            bgcolor: "#EEF5FF",
          },
          "&.Mui-selected:hover": { bgcolor: "#E7F1FF" },
        },
      }}
    >
      <ToggleButton value="yes">Taip</ToggleButton>
      <ToggleButton value="no">Ne</ToggleButton>
    </ToggleButtonGroup>
  );
}

function Question({ title, hint, children, divider = true }) {
  return (
    <Box>
      <Typography sx={{ fontSize: "0.84rem", fontWeight: 750, lineHeight: 1.35, color: "#1D2939" }}>
        {title}
      </Typography>
      {hint && (
        <Typography sx={{ mt: 0.35, fontSize: "0.73rem", lineHeight: 1.42, color: "#7A8496" }}>
          {hint}
        </Typography>
      )}
      <Box sx={{ mt: 1.1 }}>{children}</Box>
      {divider && <Divider sx={{ mt: 1.8, borderColor: "#EEF1F5" }} />}
    </Box>
  );
}

function ibanOk(v) {
  const s = (v || "").replace(/\s/g, "").toUpperCase();
  if (s.length < 15 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
}

export default function Anketa() {
  const { me, refresh } = useAuth();
  const [f, setF] = useState(null);
  const [hasKids, setHasKids] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const top = useRef(null);
  const nav = useNavigate();

  const [summed, setSummed] = useState(null); // {overtime_to_vacation, period}
  const [otSaved, setOtSaved] = useState(false);
  const first = me.employee.data_status !== "complete";
  const readOnly = me.employee.read_only;

  const set = (v) => {
    setF((s) => ({ ...s, ...v }));
    setSaved(false);
  };

  useEffect(() => {
    api
      .get("anketa/")
      .then((r) => {
        setF(r.data);
        setHasKids(r.data.children.length > 0 ? true : first ? null : false);
      })
      .catch((e) => setError(apiError(e)));
    api.get("home/").then((r) => setSummed(r.data.roster || null)).catch(() => {});
  }, [first]);

  const setOvertime = async (toVacation) => {
    try {
      await api.post("roster/", { action: "overtime_choice", to_vacation: toVacation });
      setSummed((s) => ({ ...s, overtime_to_vacation: toVacation }));
      setOtSaved(true);
    } catch (err) {
      setError(apiError(err));
    }
  };

  if (!f) {
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : (
      <Box sx={{ minHeight: 240, display: "grid", placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const setChild = (i, v) => {
    set({ children: f.children.map((c, j) => (j === i ? { ...c, ...v } : c)) });
  };

  const validate = () => {
    const e = {};
    if (!f.address.trim()) e.address = "Įrašykite adresą";
    if (!ibanOk(f.iban)) e.iban = "Patikrinkite sąskaitos numerį (pvz. LT12 3456 ...)";
    if (hasKids === null) e.kids = "Pasirinkite Taip arba Ne";
    if (hasKids) {
      f.children.forEach((c, i) => {
        if (!c.birth_date) e[`child${i}`] = "Nurodykite gimimo datą";
      });
    }
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);

    if (Object.keys(e).length) {
      setError("Patikrinkite pažymėtus laukus");
      top.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    setBusy(true);
    setError("");
    try {
      await api.put("anketa/", {
        ...f,
        children: hasKids ? f.children : [],
        single_parent: hasKids ? f.single_parent : false,
      });
      await refresh();

      if (first) nav("/", { replace: true });
      else {
        setSaved(true);
        top.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      setError(apiError(err));
      top.current?.scrollIntoView({ behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack ref={top} gap={1.5} sx={{ pb: 1.5 }}>
      {!first && <BackButton onClick={() => nav(-1)} />}
      <Box sx={{ px: 0.15, pb: 0.35 }}>
        <Typography sx={{ fontSize: { xs: "1.45rem", sm: "1.55rem" }, fontWeight: 850, letterSpacing: "-0.025em", color: "#101828" }}>
          {first ? "Užpildykite savo duomenis" : "Mano duomenys"}
        </Typography>
        <Typography sx={{ mt: 0.35, maxWidth: 520, fontSize: "0.79rem", lineHeight: 1.45, color: "#7A8496" }}>
          {first
            ? "Duomenys reikalingi atlyginimui, mokesčiams ir darbo sutarčiai."
            : "Čia galite atnaujinti duomenis, reikalingus atlyginimui ir mokesčiams."}
        </Typography>
      </Box>

      {saved && <Alert severity="success">Pakeitimai išsaugoti</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={cardSx}>
        <SectionHeader
          icon={<AccountBalanceOutlinedIcon />}
          title="Kontaktai ir sąskaita"
          subtitle="Kontaktai ir sąskaita, į kurią pervedamas atlyginimas."
        />
        <Divider sx={{ my: 1.8, borderColor: "#EEF1F5" }} />

        <Stack gap={1.45}>
          <Field label="Gyvenamosios vietos adresas">
            <TextField
              value={f.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="Gatvė, namas, butas, miestas"
              disabled={readOnly}
              error={!!errors.address}
              helperText={errors.address}
              size="small"
              sx={inputSx}
            />
          </Field>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.35 }}>
            <Field label="Telefonas" optional>
              <TextField
                value={f.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="+370 600 00000"
                disabled={readOnly}
                size="small"
                inputProps={{ inputMode: "tel" }}
                sx={inputSx}
              />
            </Field>

            <Field label="El. paštas" optional>
              <TextField
                value={f.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="vardas@pastas.lt"
                disabled={readOnly}
                size="small"
                inputProps={{ inputMode: "email", autoCapitalize: "none" }}
                sx={inputSx}
              />
            </Field>
          </Box>

          <Field label="Banko sąskaita (IBAN)">
            <TextField
              value={f.iban}
              onChange={(e) => set({ iban: e.target.value.toUpperCase().replace(/\s/g, "") })}
              placeholder="LT00 0000 0000 0000 0000"
              disabled={readOnly}
              error={!!errors.iban}
              helperText={errors.iban || "Į šią sąskaitą bus pervedamas atlyginimas"}
              size="small"
              inputProps={{ autoCapitalize: "characters", spellCheck: false }}
              sx={inputSx}
            />
          </Field>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={cardSx}>
        <SectionHeader
          icon={<PaymentsOutlinedIcon />}
          title="Mokesčiai"
          subtitle="Nustatymai, kurie gali turėti įtakos atlyginimo skaičiavimui."
        />
        <Divider sx={{ my: 1.8, borderColor: "#EEF1F5" }} />

        <Stack gap={1.8}>
          <Question
            title="Ar dirbate dar kitoje darbovietėje, kur jums taikomas NPD?"
            hint="NPD mažina pajamų mokestį, bet taikomas tik vienoje darbovietėje. Jei dirbate tik čia – rinkitės „Ne“."
          >
            <YesNo
              value={f.works_elsewhere_with_npd}
              onChange={(v) => set({ works_elsewhere_with_npd: v })}
              disabled={readOnly}
            />
          </Question>

          <Question
            title="Ar kaupiate pensijai II pakopoje?"
            hint="Nežinote? Tai matyti „Sodros“ savitarnoje arba pensijų fondo sutartyje."
          >
            <YesNo
              value={f.pension_accumulation}
              onChange={(v) => set({ pension_accumulation: v })}
              disabled={readOnly}
            />
          </Question>

          <Box>
            <Field label="Ar jums nustatytas dalyvumo lygis (negalia)?">
              <TextField
                select
                value={f.participation_level}
                onChange={(e) => set({ participation_level: e.target.value })}
                disabled={readOnly}
                size="small"
                helperText="Iki 2024 m. vadinosi darbingumo lygiu"
                SelectProps={{ MenuProps: { disableScrollLock: true } }}
                sx={inputSx}
              >
                <MenuItem value="none">Ne</MenuItem>
                <MenuItem value="30_55">Taip, 30–55 %</MenuItem>
                <MenuItem value="0_25">Taip, 0–25 %</MenuItem>
              </TextField>
            </Field>
          </Box>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={cardSx}>
        <SectionHeader
          icon={<FamilyRestroomOutlinedIcon />}
          title="Vaikai"
          subtitle="Šie duomenys naudojami nustatant papildomas poilsio dienas ir kitas lengvatas."
        />
        <Divider sx={{ my: 1.8, borderColor: "#EEF1F5" }} />

        <Question title="Ar auginate vaikų iki 18 metų?" divider={false}>
          <YesNo
            value={hasKids}
            disabled={readOnly}
            onChange={(v) => {
              setHasKids(v);
              if (v && f.children.length === 0) set({ children: [emptyChild()] });
            }}
          />
          {errors.kids && (
            <Typography sx={{ mt: 0.65, fontSize: "0.7rem", color: "error.main" }}>
              {errors.kids}
            </Typography>
          )}
        </Question>

        {hasKids && (
          <Stack gap={1.2} sx={{ mt: 1.6 }}>
            {f.children.map((c, i) => (
              <Box
                key={i}
                sx={{
                  p: 1.4,
                  borderRadius: 1.25,
                  bgcolor: "#F8FAFC",
                  border: "1px solid #E7ECF2",
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
                  <Typography sx={{ fontSize: "0.82rem", fontWeight: 800, color: "#1D2939" }}>
                    {i + 1}-as vaikas
                  </Typography>
                  {!readOnly && f.children.length > 1 && (
                    <IconButton
                      size="small"
                      aria-label="Pašalinti vaiką"
                      onClick={() => set({ children: f.children.filter((_, j) => j !== i) })}
                      sx={{ color: "#D92D20", mr: -0.5 }}
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>

                <Stack gap={1.2}>
                  <Field label="Vardas" optional>
                    <TextField
                      value={c.first_name}
                      onChange={(e) => setChild(i, { first_name: e.target.value })}
                      disabled={readOnly}
                      size="small"
                      sx={inputSx}
                    />
                  </Field>

                  <Field label="Gimimo data">
                    <LtDatePicker
                      label=""
                      value={c.birth_date || ""}
                      onChange={(value) => setChild(i, { birth_date: value })}
                      disabled={readOnly}
                      error={!!errors[`child${i}`]}
                      helperText={errors[`child${i}`]}
                      size="small"
                    />
                  </Field>

                  <Field label="Ar vaikui nustatyta negalia?">
                    <YesNo
                      compact
                      value={!!c.has_disability}
                      onChange={(v) => setChild(i, { has_disability: v })}
                      disabled={readOnly}
                    />
                  </Field>
                </Stack>
              </Box>
            ))}

            {!readOnly && (
              <Button
                variant="text"
                startIcon={<AddRoundedIcon />}
                onClick={() => set({ children: [...f.children, emptyChild()] })}
                sx={{
                  alignSelf: "stretch",
                  minHeight: 42,
                  bgcolor: "#F3F7FD",
                  borderRadius: 1.2,
                  "&:hover": { bgcolor: "#EBF3FF" },
                }}
              >
                Pridėti vaiką
              </Button>
            )}

            <FormControlLabel
              sx={{
                m: 0,
                mt: 0.25,
                alignItems: "center",
                "& .MuiFormControlLabel-label": { fontSize: "0.78rem", color: "#475467" },
              }}
              control={
                <Checkbox
                  size="small"
                  checked={f.single_parent}
                  onChange={(e) => set({ single_parent: e.target.checked })}
                />
              }
              label="Vaiką (vaikus) auginu vienas (-a)"
              disabled={readOnly}
            />
          </Stack>
        )}
      </Paper>

      {summed && !first && (
        <Paper variant="outlined" sx={cardSx}>
          <SectionHeader
            icon={<ScheduleOutlinedIcon />}
            title="Darbo laikas"
            subtitle="Jums taikoma suminė darbo laiko apskaita."
          />
          <Divider sx={{ my: 1.8, borderColor: "#EEF1F5" }} />
          <Question title="Jei dirbsiu daugiau nei norma" hint={`Apskaitinis laikotarpis ${summed.period || ""}. Viršytas laikas apmokamas kaip viršvalandžiai arba, jūsų prašymu, x1,5 pridedamas prie atostogų.`} divider={false}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              disabled={readOnly}
              value={summed.overtime_to_vacation ? "vac" : "pay"}
              onChange={(_, v) => v && setOvertime(v === "vac")}
              sx={{
                mt: 0.5,
                "& .MuiToggleButton-root": { minHeight: 42, fontSize: ".78rem", fontWeight: 750, borderColor: "#dfe5ee" },
                "& .Mui-selected": { bgcolor: "#eaf4ff !important", color: "#1476ff" },
              }}
            >
              <ToggleButton value="pay">Išmokėti</ToggleButton>
              <ToggleButton value="vac">Pridėti prie atostogų</ToggleButton>
            </ToggleButtonGroup>
            {otSaved && <Typography sx={{ mt: 0.65, fontSize: "0.72rem", color: "success.main" }}>Pasirinkimas išsaugotas</Typography>}
          </Question>
        </Paper>
      )}

      {!readOnly && (
        <Button
          variant="contained"
          size="large"
          disabled={busy}
          onClick={save}
          sx={{ minHeight: 48, borderRadius: 1.25, mt: 0.25 }}
        >
          {first ? "Išsaugoti ir tęsti" : "Išsaugoti pakeitimus"}
        </Button>
      )}
    </Stack>
  );
}
