import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";

import { MONTHS, apiError, payrollApi } from "../../api/payroll";

const G_FIELDS = [
  ["g8", "8. Su darbo santykiais nesusijusios A kl. išmokos (pvz. dividendai)"],
  ["g9", "9. Jų GPM, išmokėtų iki 15 d."],
  ["g10", "10. Jų GPM, išmokėtų po 15 d."],
  ["g11", "11. B klasės išmokos, nuo kurių išskaičiuotas GPM"],
  ["g12", "12. GPM nuo B klasės išmokų"],
];

const STATUS = {
  ready: { label: "Paruošta", color: "#155EEF", background: "#EFF4FF" },
  submitted: { label: "Pateikta", color: "#B54708", background: "#FFFAEB" },
  accepted: { label: "Priimta", color: "#027A48", background: "#ECFDF3" },
  error: { label: "Klaida", color: "#B42318", background: "#FEF3F2" },
  rejected: { label: "Atmesta", color: "#B42318", background: "#FEF3F2" },
  missing: { label: "Neparuošta", color: "#667085", background: "#F2F4F7" },
};

const GROUPS = [
  {
    id: "monthly",
    title: "Periodinės deklaracijos",
    description: "SAM, GPM313, GPM312 ir SDUP",
    forms: ["SAM", "GPM313", "GPM312", "SDUP"],
    icon: AssignmentOutlinedIcon,
    empty: "Šiam laikotarpiui periodinių deklaracijų nėra.",
  },
  {
    id: "people",
    title: "Darbuotojų pokyčiai",
    description: "Priėmimas ir atleidimas · 1-SD, 2-SD",
    forms: ["1-SD", "2-SD"],
    icon: PeopleOutlineIcon,
    empty: "Šį mėnesį darbuotojų nepriimta ir neatleista.",
  },
  {
    id: "absences",
    title: "Nebuvimai",
    description: "Neatvykimai ir atostogos · 9-SD, 12-SD",
    forms: ["9-SD", "12-SD"],
    icon: EventBusyOutlinedIcon,
    empty: "Šį mėnesį pranešimų apie nebuvimus nėra.",
    note: "Pranešimai ruošiami pagal užregistruotus nebuvimus. Pakeitus datas po pateikimo, rengiamas patikslinimas. Terminas – kita darbo diena.",
  },
];

const KNOWN_FORMS = new Set(GROUPS.flatMap((group) => group.forms));

function prevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formattedDate(value) {
  if (!value) return "–";
  const parts = String(value).slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return value;
  return new Intl.DateTimeFormat("lt-LT", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(parts[0], parts[1] - 1, parts[2])
  );
}

function itemKey(it) {
  return `${it.form}-${it.contract ?? ""}-${it.absence_event ?? ""}-${it.variant ?? ""}`;
}

function isOverdue(it, today) {
  return Boolean(
    it.deadline && it.deadline < today && !["submitted", "accepted"].includes(it.declaration?.status)
  );
}

function needsAction(it) {
  const d = it.declaration;
  return (
    !d ||
    ["ready", "error", "rejected"].includes(d.status) ||
    (d.status === "submitted" && d.external_status === "Laukia patvirtinimo EDS")
  );
}

function isSubmitted(it) {
  return ["submitted", "accepted"].includes(it.declaration?.status);
}

function StatusChip({ declaration }) {
  const definition = STATUS[declaration?.status] || STATUS.missing;
  return (
    <Chip
      size="small"
      label={declaration?.status_label || definition.label}
      sx={{
        height: 26,
        bgcolor: definition.background,
        color: definition.color,
        fontWeight: 700,
        fontSize: 12,
        borderRadius: 1.5,
        ".MuiChip-label": { px: 1.1 },
      }}
    />
  );
}

function SummaryTile({ icon: Icon, label, value, color, bg, activeGradient, activeBorder, selected, onClick }) {
  return (
    <Paper
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      variant="outlined"
      sx={{
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        color: "text.primary",
        p: { xs: 1.7, sm: 2.1 },
        borderRadius: 2.8,
        borderColor: selected ? activeBorder : "divider",
        borderWidth: selected ? 1.5 : 1,
        background: selected ? activeGradient : "linear-gradient(180deg, #FFFFFF 0%, #FCFCFD 100%)",
        minWidth: 0,
        boxShadow: selected
          ? `0 0 0 2px ${activeBorder}22, 0 10px 24px rgba(16, 24, 40, .05)`
          : "0 1px 3px rgba(16, 24, 40, .025)",
        transition: "background .15s ease, border-color .15s ease, box-shadow .15s ease, transform .15s ease",
        "&:hover": {
          borderColor: selected ? activeBorder : "#D0D5DD",
          transform: "translateY(-1px)",
          boxShadow: selected
            ? `0 0 0 2px ${activeBorder}22, 0 14px 28px rgba(16, 24, 40, .06)`
            : "0 6px 18px rgba(16, 24, 40, .05)",
        },
        "&:focus-visible": { outline: `3px solid ${activeBorder}55`, outlineOffset: 2 },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1.2}>
        <Box>
          <Typography variant="caption" sx={{ color: selected ? activeBorder : "text.secondary", fontWeight: 700 }}>
            {label}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 780, letterSpacing: "-.04em", mt: .45, fontSize: { xs: 26, sm: 31 } }}>
            {value}
          </Typography>
        </Box>
        <Box sx={{ width: 40, height: 40, borderRadius: 2.2, bgcolor: selected ? "rgba(255,255,255,.55)" : bg, display: "grid", placeItems: "center", flexShrink: 0, border: selected ? `1px solid ${activeBorder}22` : "none" }}>
          <Icon sx={{ color, fontSize: 20 }} />
        </Box>
      </Stack>
    </Paper>
  );
}

function DeclarationCard({ it, today, busy, onGenerate, onDownload, onSubmitVmi, onCheck, onMark, onEditGpm }) {
  const d = it.declaration;
  const [menuAnchor, setMenuAnchor] = useState(null);
  const working = busy === itemKey(it);
  const overdue = isOverdue(it, today);
  const fileExtension = it.format === "json" ? ".json" : ".ffdata";
  const canDownload = Boolean(d && d.status !== "error");
  const closeMenuAnd = (callback) => {
    setMenuAnchor(null);
    callback();
  };

  let primary;
  if (!d || ["error", "rejected"].includes(d.status)) {
    primary = { label: d ? "Paruošti iš naujo" : "Paruošti deklaraciją", action: () => onGenerate(it, d?.manual_values) };
  } else if (d.status === "ready" && it.form === "GPM313") {
    primary = { label: "Pateikti VMI", icon: <CloudUploadOutlinedIcon />, action: () => onSubmitVmi(it) };
  } else if (d.status === "ready") {
    primary = { label: `Atsisiųsti ${fileExtension}`, icon: <DownloadOutlinedIcon />, action: () => onDownload(it) };
  } else if (d.status === "submitted" && it.form === "GPM313") {
    primary = { label: "Tikrinti būseną", icon: <RefreshIcon />, action: () => onCheck(it) };
  } else if (d.status === "submitted") {
    primary = { label: "Pažymėti priimta", icon: <CheckCircleOutlineIcon />, action: () => onMark(it, "accepted") };
  } else {
    primary = { label: `Atsisiųsti ${fileExtension}`, icon: <DownloadOutlinedIcon />, action: () => onDownload(it) };
  }

  const primaryIsDownload = Boolean(d && ["ready", "accepted"].includes(d.status) && it.form !== "GPM313") || d?.status === "accepted";
  const menuOptions = [];
  if (d && !["error", "rejected"].includes(d.status)) {
    menuOptions.push({ label: "Paruošti iš naujo", action: () => onGenerate(it, d.manual_values) });
  }
  if (d?.status === "ready") {
    menuOptions.push({ label: "Pažymėti pateikta", action: () => onMark(it, "submitted") });
  }
  if (d?.status === "submitted" && it.form === "GPM313") {
    menuOptions.push({ label: "Pažymėti priimta", action: () => onMark(it, "accepted") });
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        px: { xs: 1.6, md: 2 },
        py: { xs: 1.5, md: 1.7 },
        borderRadius: 2.5,
        borderColor: overdue ? "#FDA29B" : "#E4E7EC",
        bgcolor: "#FFFFFF",
        boxShadow: "0 1px 2px rgba(16, 24, 40, .04)",
        transition: "border-color .15s ease, box-shadow .15s ease, transform .15s ease",
        "&:hover": {
          borderColor: overdue ? "#F97066" : "#D0D5DD",
          boxShadow: "0 8px 24px rgba(16, 24, 40, .06)",
          transform: "translateY(-1px)",
        },
      }}
    >
      <Stack gap={1.15}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "flex-start" }} gap={1.1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" flexWrap="wrap" gap={.7}>
              <Chip
                size="small"
                label={it.form}
                sx={{ bgcolor: "#F2F4F7", fontWeight: 800, borderRadius: 1.2, height: 23, fontSize: 11.5 }}
              />
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700 }}>
                {it.authority}
              </Typography>
              {it.correction && (
                <Chip size="small" variant="outlined" color="warning" label="Patikslinimas"
                  sx={{ borderRadius: 1.2, height: 23, fontWeight: 700, fontSize: 11 }} />
              )}
            </Stack>

            <Typography sx={{ mt: .75, fontSize: { xs: 16, md: 17 }, fontWeight: 780, lineHeight: 1.35, color: "#101828" }}>
              {it.title}
            </Typography>

            <Stack direction="row" flexWrap="wrap" alignItems="center" columnGap={1.8} rowGap={.55} mt={.7}>
              <Stack direction="row" alignItems="center" gap={.55}>
                <CalendarMonthOutlinedIcon sx={{ fontSize: 15, color: overdue ? "error.main" : "text.secondary" }} />
                <Typography variant="caption" sx={{ color: overdue ? "error.main" : "text.secondary", fontWeight: overdue ? 700 : 500 }}>
                  {it.deadline ? `Pateikti iki ${formattedDate(it.deadline)}` : "Terminas nenurodytas"}
                  {overdue && " · Pavėluota"}
                </Typography>
              </Stack>
              {d?.submitted_at && (
                <Typography variant="caption" color="text.secondary">
                  Pateikta: {new Date(d.submitted_at).toLocaleDateString("lt-LT")}
                </Typography>
              )}
            </Stack>
          </Box>

          <StatusChip declaration={d} />
        </Stack>

        {it.form === "SDUP" && (
          <Alert severity="info" icon={<InfoOutlinedIcon fontSize="inherit" />} sx={{ borderRadius: 1.8, py: 0, ".MuiAlert-message": { py: .6 } }}>
            {it.correction
              ? "Pateikite patikslintą SDUP per 2 darbo dienas – su visais šio mėnesio darbuotojais."
              : "Sodros EDAS → SDUP → Įkelti JSON failą. Duomenys – iš patvirtinto mėnesio DU."}
          </Alert>
        )}

        {d?.errors?.length > 0 && (
          <Alert
            severity={d.status === "error" ? "error" : "warning"}
            sx={{
              borderRadius: 1.8,
              alignItems: "center",
              py: 0,
              "& .MuiAlert-icon": { display: "flex", alignItems: "center", py: 0 },
              "& .MuiAlert-message": {
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                minHeight: 40,
                py: 0,
              },
            }}
          >
            {d.errors.map((message, index) => <Box key={index}>{message}</Box>)}
          </Alert>
        )}

        {d?.status === "submitted" && d.external_status && (
          <Alert severity="info" sx={{ borderRadius: 1.8, py: 0, ".MuiAlert-message": { py: .6 } }}>
            <strong>{d.external_status}.</strong>{" "}
            {d.external_status === "Laukia patvirtinimo EDS" && (
              <>
                Patvirtinkite <Link href="https://deklaravimas.vmi.lt" target="_blank" rel="noopener noreferrer">EDS</Link>:
                {" "}Deklaravimas → Patvirtinti užpildytą formą.{" "}
              </>
            )}
            {d.external_message}
          </Alert>
        )}

        {d?.status === "ready" && it.form !== "GPM313" && (
          <Box sx={{ px: 1.2, py: .9, borderRadius: 1.8, bgcolor: "#F8FAFC", border: "1px solid #EAECF0" }}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              {it.form === "SDUP"
                ? "Atsisiųskite JSON failą, įkelkite jį į Sodros EDAS ir pasirašykite."
                : it.authority === "Sodra"
                  ? "Įkelkite failą į Sodros EDAS (pranešimų pateikimas iš failo) ir pasirašykite."
                  : "Įkelkite failą į VMI EDS: Deklaravimas → Persiųsti užpildytą formą."}
            </Typography>
          </Box>
        )}

        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
          gap={1}
          sx={{ pt: 1.2, mt: .1, borderTop: "1px solid #EAECF0" }}
        >
          <Box>
            {it.form === "GPM313" && (
              <Button size="small" variant="text" color="inherit" disabled={working} onClick={() => onEditGpm(it)}
                sx={{ fontWeight: 700, textTransform: "none", px: 0 }}>
                Kitos išmokos
              </Button>
            )}
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="flex-end" flexWrap="wrap" gap={.75}>
            {canDownload && !primaryIsDownload && (
              <Button size="small" variant="outlined" color="inherit" startIcon={<DownloadOutlinedIcon />}
                disabled={working} onClick={() => onDownload(it)} sx={{ textTransform: "none" }}>
                Atsisiųsti
              </Button>
            )}
            <Button
              size="small"
              variant={d?.status === "accepted" ? "outlined" : "contained"}
              color={d?.status === "accepted" ? "inherit" : "primary"}
              startIcon={working ? <CircularProgress size={15} color="inherit" /> : primary.icon}
              disabled={working}
              onClick={primary.action}
              sx={{ fontWeight: 700, boxShadow: "none", whiteSpace: "nowrap", textTransform: "none", "&:hover": { boxShadow: "none" } }}
            >
              {primary.label}
            </Button>
            {menuOptions.length > 0 && (
              <>
                <Tooltip title="Daugiau veiksmų">
                  <span>
                    <IconButton
                      size="small"
                      disabled={working}
                      onClick={(event) => setMenuAnchor(event.currentTarget)}
                      aria-label="Daugiau veiksmų"
                      sx={{ border: 1, borderColor: "divider", bgcolor: "background.paper", borderRadius: 1.5 }}
                    >
                      <MoreHorizIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                  {menuOptions.map((option) => (
                    <MenuItem key={option.label} onClick={() => closeMenuAnd(option.action)} sx={{ fontSize: 14 }}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}

function DeclarationSection({ group, rows, today, busy, handlers, showEmpty = false }) {
  const Icon = group.icon;
  if (!rows.length && !showEmpty) return null;

  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{
        p: { xs: 1.6, sm: 2, md: 2.3 },
        borderRadius: 3,
        borderColor: "#EAECF0",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFD 100%)",
        boxShadow: "0 1px 2px rgba(16, 24, 40, .03)",
      }}
    >
      <Stack direction="row" alignItems="center" gap={1.2} mb={1.5}>
        <Box sx={{ display: "grid", placeItems: "center", height: 38, width: 38, borderRadius: 2.2, bgcolor: "#F2F4F7", flexShrink: 0 }}>
          <Icon sx={{ fontSize: 20, color: "text.secondary" }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.25 }}>{group.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .2 }}>{group.description}</Typography>
        </Box>
        <Chip size="small" label={rows.length} sx={{ fontWeight: 800, bgcolor: "#F2F4F7", borderRadius: 1.6, height: 28 }} />
      </Stack>

      {rows.length > 0 ? (
        <Stack gap={1.15}>
          {rows.map((it) => (
            <DeclarationCard key={itemKey(it)} it={it} today={today} busy={busy} {...handlers} />
          ))}
        </Stack>
      ) : (
        <Paper variant="outlined" sx={{ p: 2.3, borderRadius: 2.5, bgcolor: "background.paper", borderStyle: "dashed" }}>
          <Stack direction="row" gap={1.2} alignItems="center">
            <CheckCircleOutlineIcon sx={{ fontSize: 21, color: "success.main" }} />
            <Typography variant="body2" color="text.secondary">{group.empty}</Typography>
          </Stack>
        </Paper>
      )}

      {group.note && rows.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25, lineHeight: 1.7 }}>
          {group.note}
        </Typography>
      )}
    </Paper>
  );
}

export default function DeklaracijosPage() {
  const [{ year, month }, setYm] = useState(prevMonth);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [gpm, setGpm] = useState(null);
  const [filter, setFilter] = useState("all");
  const requestId = useRef(0);

  const load = useCallback(async ({ reset = false } = {}) => {
    const thisRequest = ++requestId.current;
    if (reset) setItems(null);
    setLoading(true);
    try {
      const result = await payrollApi.declarations(year, month);
      if (thisRequest !== requestId.current) return;
      setItems(Array.isArray(result) ? result : []);
      setError("");
    } catch (e) {
      if (thisRequest !== requestId.current) return;
      setError(apiError(e));
      setItems([]);
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    load({ reset: true });
    return () => { requestId.current += 1; };
  }, [load]);

  const shift = (amount) => {
    const d = new Date(year, month - 1 + amount, 1);
    setFilter("all");
    setYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const runAction = async (it, callback, reload = true) => {
    setBusy(itemKey(it));
    setError("");
    try {
      await callback();
      if (reload) await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  };

  const generate = (it, manual) => runAction(it, () => payrollApi.generateDeclaration({
    form: it.form,
    year: it.year || year,
    month: it.form === "GPM312" ? null : month,
    contract: it.contract,
    manual,
    absence_event: it.absence_event,
    variant: it.variant,
  }));

  const download = (it) => runAction(it, async () => {
    const blob = await payrollApi.declarationFile(it.declaration.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const period = it.form === "GPM312" ? String(it.year || year) : `${year}-${String(month).padStart(2, "0")}`;
    anchor.href = url;
    anchor.download = `${it.form}_${period}.${it.format === "json" ? "json" : "ffdata"}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, false);

  const submitVmi = (it) => runAction(it, () => payrollApi.submitDeclaration(it.declaration.id));
  const checkState = (it) => runAction(it, () => payrollApi.checkDeclaration(it.declaration.id));
  const mark = (it, status) => runAction(it, () => payrollApi.declarationStatus(it.declaration.id, status));
  const editGpm = (it) => setGpm({
    it,
    values: Object.fromEntries(G_FIELDS.map(([key]) => [key, it.declaration?.manual_values?.[key] ?? ""])),
  });

  const today = dateKey();
  const allItems = items || [];
  const attentionCount = allItems.filter(needsAction).length;
  const submittedCount = allItems.filter(isSubmitted).length;
  const overdueCount = allItems.filter((it) => isOverdue(it, today)).length;
  const shownItems = allItems.filter((it) => (
    filter === "attention" ? needsAction(it) : filter === "submitted" ? isSubmitted(it) : filter === "overdue" ? isOverdue(it, today) : true
  ));
  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    rows: shownItems.filter((it) => group.forms.includes(it.form)),
  }));
  const otherItems = shownItems.filter((it) => !KNOWN_FORMS.has(it.form));
  const hasVisible = shownItems.length > 0;

  const handlers = {
    onGenerate: generate,
    onDownload: download,
    onSubmitVmi: submitVmi,
    onCheck: checkState,
    onMark: mark,
    onEditGpm: editGpm,
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1230, mx: "auto", px: { xs: 1.5, sm: 2.5, md: 3 }, py: { xs: 2, md: 3.2 } }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={2.1} mb={2.75}>
        <Box>
          <Typography variant="h4" sx={{ fontSize: { xs: 25, md: 30 }, fontWeight: 800, letterSpacing: "-.035em" }}>
            Deklaracijos
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: .55 }}>
            Paruoškite DU deklaracijas, stebėkite terminus ir pateikimo būsenas.
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" gap={1} sx={{ alignSelf: { xs: "stretch", sm: "flex-start", md: "center" } }}>
          <Paper variant="outlined" sx={{ display: "flex", alignItems: "center", borderRadius: 2, overflow: "hidden", flex: { xs: 1, sm: "none" } }}>
            <IconButton size="small" onClick={() => shift(-1)} aria-label="Ankstesnis mėnuo" sx={{ m: .45, borderRadius: 1.25 }}>
              <ChevronLeftIcon />
            </IconButton>
            <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, minWidth: { xs: 130, sm: 170 }, px: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.1 }}>Laikotarpis</Typography>
              <Typography variant="body2" fontWeight={750} sx={{ textTransform: "capitalize", whiteSpace: "nowrap" }}>
                {MONTHS[month - 1]} {year}
              </Typography>
            </Stack>
            <IconButton size="small" onClick={() => shift(1)} aria-label="Kitas mėnuo" sx={{ m: .45, borderRadius: 1.25 }}>
              <ChevronRightIcon />
            </IconButton>
          </Paper>
          <Tooltip title="Atnaujinti duomenis">
            <span>
              <IconButton onClick={() => load()} disabled={loading} aria-label="Atnaujinti" sx={{ border: 1, borderColor: "divider", borderRadius: 2, width: 40, height: 40 }}>
                {loading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2.3, borderRadius: 2 }}>{error}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: { xs: 1.2, sm: 1.8 }, mb: 3.1 }}>
        <SummaryTile icon={AssignmentOutlinedIcon} label="Iš viso" value={items === null ? "—" : allItems.length}
          color="#344054" bg="#F2F4F7" activeGradient="linear-gradient(180deg, #FCFCFD 0%, #F2F4F7 100%)" activeBorder="#98A2B3"
          selected={filter === "all"} onClick={() => setFilter("all")} />
        <SummaryTile icon={ScheduleOutlinedIcon} label="Reikia veiksmų" value={items === null ? "—" : attentionCount}
          color="#B54708" bg="#FFF7ED" activeGradient="linear-gradient(180deg, #FFF7ED 0%, #FFEDD5 100%)" activeBorder="#F79009"
          selected={filter === "attention"} onClick={() => setFilter("attention")} />
        <SummaryTile icon={CheckCircleOutlineIcon} label="Pateikta" value={items === null ? "—" : submittedCount}
          color="#027A48" bg="#ECFDF3" activeGradient="linear-gradient(180deg, #ECFDF3 0%, #D1FADF 100%)" activeBorder="#12B76A"
          selected={filter === "submitted"} onClick={() => setFilter("submitted")} />
        <SummaryTile icon={ErrorOutlineIcon} label="Praleisti terminai" value={items === null ? "—" : overdueCount}
          color="#B42318" bg="#FEF3F2" activeGradient="linear-gradient(180deg, #FEF3F2 0%, #FEE4E2 100%)" activeBorder="#F04438"
          selected={filter === "overdue"} onClick={() => setFilter("overdue")} />
      </Box>

      {items === null ? (
        <Stack gap={1.5}>
          {[0, 1, 2].map((key) => (
            <Paper key={key} variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
              <Skeleton width="28%" height={22} />
              <Skeleton width="62%" height={29} sx={{ mt: .5 }} />
              <Skeleton width="40%" height={19} />
              <Skeleton width="100%" height={1} sx={{ mt: 1.5 }} />
              <Skeleton width={145} height={36} sx={{ ml: "auto", mt: 1 }} />
            </Paper>
          ))}
        </Stack>
      ) : hasVisible ? (
        <Stack gap={{ xs: 4, md: 4.75 }}>
          {visibleGroups.map((group) => (
            <DeclarationSection
              key={group.id}
              group={group}
              rows={group.rows}
              today={today}
              busy={busy}
              handlers={handlers}
              showEmpty={filter === "all"}
            />
          ))}
          {otherItems.length > 0 && (
            <DeclarationSection
              group={{ title: "Kitos deklaracijos", description: "Papildomi pranešimai", icon: AssignmentOutlinedIcon }}
              rows={otherItems}
              today={today}
              busy={busy}
              handlers={handlers}
            />
          )}
        </Stack>
      ) : (
        <Paper variant="outlined" sx={{ textAlign: "center", px: 2, py: 6, borderRadius: 2.5 }}>
          <Box sx={{ mx: "auto", mb: 1.8, bgcolor: "action.hover", width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: 3 }}>
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 28 }} />
          </Box>
          <Typography sx={{ fontWeight: 750, fontSize: 16 }}>
            {filter === "attention" ? "Nėra deklaracijų, kurioms reikia veiksmų" : filter === "submitted" ? "Pateiktų deklaracijų nėra" : filter === "overdue" ? "Praleistų terminų nėra" : "Šiam laikotarpiui deklaracijų nėra"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .6 }}>
            {filter === "all" ? "Kai atsiras DU duomenų ar pranešimų, jie bus rodomi čia." : "Galite peržiūrėti visas deklaracijas pakeitę filtrą."}
          </Typography>
          {filter !== "all" && <Button size="small" sx={{ mt: 1.75 }} onClick={() => setFilter("all")}>Rodyti visas</Button>}
        </Paper>
      )}

      <Dialog open={Boolean(gpm)} onClose={() => setGpm(null)} fullWidth maxWidth="sm" disableScrollLock PaperProps={{ sx: { borderRadius: 2.5 } }}>
        <DialogTitle sx={{ fontWeight: 750, pb: 1 }}>GPM313 · Kitos išmokos</DialogTitle>
        <DialogContent>
          <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 2, mt: .75, borderRadius: 1.5 }}>
            Atlyginimų sumos (5–7 laukeliai) užpildomos automatiškai. Čia įveskite kitas per mėnesį išmokėtas sumas, jei jų buvo.
          </Alert>
          <Stack gap={1.7}>
            {G_FIELDS.map(([key, label]) => (
              <TextField
                key={key}
                fullWidth
                size="small"
                label={label}
                type="number"
                value={gpm?.values[key] ?? ""}
                onChange={(event) => setGpm((current) => ({ ...current, values: { ...current.values, [key]: event.target.value } }))}
                InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button color="inherit" onClick={() => setGpm(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={() => {
            const { it, values } = gpm;
            setGpm(null);
            generate(it, values);
          }} sx={{ boxShadow: "none" }}>
            Išsaugoti ir paruošti
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
