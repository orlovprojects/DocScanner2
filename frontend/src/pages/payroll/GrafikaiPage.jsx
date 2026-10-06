import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, LinearProgress, ListItemIcon, Menu, MenuItem, Paper, Popover, Slider, Stack, Switch, Tab, Tabs,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AddIcon from "@mui/icons-material/Add";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import { MONTHS, apiError, payrollApi } from "../../api/payroll";
import LtDatePicker from "../../components/LtDatePicker"; // ⚠ pataisyk kelią, jei komponentas kitur

const WD = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"];
const PALETTE = ["#4C8BF5", "#7C3AED", "#12A594", "#F76B15", "#E5484D", "#B08A3E"];
const eur = (v) => `${Number(v || 0).toLocaleString("lt-LT", { maximumFractionDigits: 0 })} €`;
const hrs = (v) => `${Number(v || 0).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} val.`;
const list = (d) => (Array.isArray(d) ? d : d?.results || []);

function nextMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ============================================================
// Grafikas
// ============================================================

function RosterTab({ year, month }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [menu, setMenu] = useState(null); // {anchor, emp, date, shift}
  const [slotPop, setSlotPop] = useState(null); // {anchor, date, shift_type_id, min, max}
  const [tplMenu, setTplMenu] = useState(null);
  const [tplDlg, setTplDlg] = useState(null); // {name, week_start}
  const [unlockDlg, setUnlockDlg] = useState(null); // {reason, comment}
  const [lateDlg, setLateDlg] = useState(null); // [{employee_id, date}]
  const [sugg, setSugg] = useState(null); // {date, shift_type_id, from, items}
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = useCallback(() => {
    payrollApi.roster(year, month).then(setData).catch((e) => setError(apiError(e)));
  }, [year, month]);

  useEffect(() => { setData(null); load(); }, [load]);

  const gen = data?.generation || {};
  const startedAt = gen.started_at || gen.queued_at;
  const stale = startedAt && Date.now() - new Date(startedAt).getTime() > (gen.state === "queued" ? 2 : 10) * 60000;
  const running = (gen.state === "queued" || gen.state === "running") && !stale;
  useEffect(() => {
    clearInterval(timer.current);
    if (running) timer.current = setInterval(load, 4000);
    return () => clearInterval(timer.current);
  }, [running, load]);

  const act = async (payload, okMsg) => {
    setBusy(true); setError("");
    try {
      const r = await payrollApi.rosterAction({ year, month, ...payload });
      if (r.roster) {
        setData(r.roster);
        const sent = r.no_changes ? " Pakeitimų nebuvo." : r.notified ? ` Pranešimai išsiųsti ${r.notified} darbuotojams.` : "";
        setInfo(r.late ? `Paskelbta vėliau nei likus 7 dienoms iki mėnesio pradžios (DK 115 str.).${sent}` : `${okMsg || ""}${sent}`);
      }
      else if (r.state === "queued") load();
      else {
        setData(r);
        if (payload.action === "cell" && payload.shift_type_id) {
          const v = (r.rule_violations || []).filter((x) => x.date === payload.date && (x.employee_id === payload.employee_id || x.employee_id == null));
          if (v.length) { setInfo(`⚠ ${[...new Set(v.map((x) => x.message))].join(" · ")}`); return; }
        }
        if (okMsg) setInfo(okMsg);
      }
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.late_changes) {
        setData(e.response.data.roster);
        setLateDlg(e.response.data.late_changes);
      } else setError(apiError(e));
    } finally { setBusy(false); }
  };

  const openSuggest = async (date, shiftTypeId, fromEmp) => {
    setError("");
    try {
      const r = await payrollApi.rosterAction({ year, month, action: "suggest", date, shift_type_id: shiftTypeId, exclude_employee_id: fromEmp || null });
      setSugg({ date, shift_type_id: shiftTypeId, from: fromEmp || null, items: r.candidates });
    } catch (e) { setError(apiError(e)); }
  };

  const types = data?.shift_types || [];
  const color = (id) => types.find((t) => t.id === id)?.color || PALETTE[types.findIndex((t) => t.id === id) % PALETTE.length];
  const cell = useMemo(() => {
    const m = {};
    (data?.shifts || []).forEach((s) => { m[`${s.employee_id}|${s.date}`] = s; });
    return m;
  }, [data]);
  const viol = useMemo(() => {
    const m = {};
    (data?.violations || []).forEach((v) => { (m[`${v.employee_id}|${v.date}`] ||= []).push(v.message); });
    return m;
  }, [data]);

  const ruleViol = {};
  (data?.rule_violations || []).forEach((v) => { if (v.employee_id) (ruleViol[`${v.employee_id}|${v.date}`] ||= []).push(v.message); });
  const slotMap = {};
  (data?.slots || []).forEach((x) => { slotMap[`${x.date}|${x.shift_type_id}`] = x; });
  const mondays = (data?.days || []).filter((d) => d.weekday === 0).map((d) => d.date);

  if (!data) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress />;

  const published = data.status === "published";
  const editing = data.status === "editing";
  const locked = published;
  const variants = gen.variants || [];

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {info && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setInfo("")}>{info}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} gap={2} alignItems={{ md: "center" }}>
          <Chip color={published ? "success" : editing ? "warning" : "default"}
            label={published ? `Paskelbtas ir užrakintas (v${data.version})` : editing ? `Keičiamas (paskelbta v${data.version})` : "Juodraštis"} />
          <Typography variant="body2" color="text.secondary">
            Paskelbti iki <b>{data.publish_deadline}</b>{data.cost ? ` · kaina ~${eur(data.cost)}` : ""}
            {published ? ` · susipažino ${data.acks.length} iš ${data.employees.length}` : ""}
          </Typography>
          <Box flex={1} />
          {published && (
            <Button variant="outlined" startIcon={<LockOpenIcon />} onClick={() => setUnlockDlg({ reason: "illness", comment: "" })}>Atrakinti</Button>
          )}
          <Button variant="outlined" startIcon={<AutoAwesomeIcon />} disabled={running || busy || locked}
            onClick={() => act({ action: "generate" })}>
            {running ? "Sudaroma…" : "Sudaryti automatiškai"}
          </Button>
          <Button variant="contained" startIcon={<CampaignOutlinedIcon />} disabled={busy || !data.shifts.length || locked}
            onClick={() => act({ action: "publish" }, editing ? "Pakeitimai paskelbti" : "Grafikas paskelbtas darbuotojams")}>
            {editing ? "Paskelbti pakeitimus" : "Paskelbti"}
          </Button>
        </Stack>
        {editing && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Grafikas keičiamas: <b>{data.pending_reason}</b>. Darbuotojai mato ankstesnę versiją, kol nepaskelbsite pakeitimų -
            tada pranešimas bus išsiųstas tik tiems, kurių grafikas pasikeitė.
          </Alert>
        )}
        {locked && <Typography variant="caption" color="text.secondary" display="block" mt={1}>Paskelbtas grafikas užrakintas. Norėdami pakeisti (pvz. dėl ligos) - „Atrakinti“.</Typography>}
        {running && <LinearProgress sx={{ mt: 2 }} />}
        {running && <Typography variant="caption" color="text.secondary">Sistema ieško geriausio grafiko pagal taisykles, normas ir kainą (iki ~2 min.)</Typography>}
        {gen.state === "error" && <Alert severity="error" sx={{ mt: 2 }}>{gen.error}</Alert>}
        {stale && (gen.state === "queued" || gen.state === "running") && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Užduotis užtruko ilgiau nei įprastai. Paleiskite dar kartą arba susisiekite su mumis.
          </Alert>
        )}
        {gen.state === "done" && variants.length > 0 && (
          <Stack direction={{ xs: "column", md: "row" }} gap={1.5} mt={2}>
            {variants.map((v) => (
              <Paper key={v.index} variant="outlined" sx={{ p: 1.5, flex: 1 }}>
                <Typography fontWeight={700}>Variantas {v.index + 1}</Typography>
                <Typography variant="body2">Kaina ~{eur(v.cost)}</Typography>
                {v.unmet.length === 0
                  ? <Typography variant="body2" color="success.main">Visos būtinos taisyklės įvykdytos</Typography>
                  : v.unmet.map((u) => (
                    <Typography key={u.rule_id} variant="caption" color="warning.main" display="block">
                      ⚠ {u.label}: {u.dates.slice(0, 5).map((d) => d.slice(8)).join(", ")}{u.dates.length > 5 ? "…" : ""} d.
                    </Typography>
                  ))}
                <Button size="small" sx={{ mt: 1 }} disabled={busy} onClick={() => act({ action: "apply", index: v.index }, "Variantas pritaikytas - galite koreguoti langelius")}>
                  Pritaikyti
                </Button>
              </Paper>
            ))}
          </Stack>
        )}
      </Paper>

      {(data.hints || []).map((h, i) => (
        <Alert key={i} severity={h.level === "error" ? "error" : h.level === "warning" ? "warning" : "info"} sx={{ mb: 1 }}>{h.message}</Alert>
      ))}

      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" mb={1.5}>
        <Typography fontWeight={700} mr={1}>Pamainų planas</Typography>
        <Button size="small" variant="outlined" disabled={busy} onClick={() => act({ action: "plan_from_rules" }, "Planas užpildytas pagal taisykles")}>Užpildyti pagal taisykles</Button>
        <Button size="small" variant="outlined" disabled={busy} onClick={() => act({ action: "copy_prev_plan" }, "Nukopijuotas praėjusio mėnesio planas")}>Kopijuoti praėjusį mėnesį</Button>
        <Button size="small" variant="outlined" onClick={(e) => setTplMenu(e.currentTarget)}>Šablonai</Button>
        <Typography variant="caption" color="text.secondary">Spauskite plano langelį ir nurodykite, kiek žmonių reikia</Typography>
      </Stack>

      {data.employees.length === 0 ? (
        <Alert severity="info">Nėra darbuotojų su sumine darbo laiko apskaita. Ją nustatykite darbuotojo sutarties sąlygose.</Alert>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ borderCollapse: "collapse", fontSize: 12, "& td, & th": { border: "1px solid", borderColor: "divider", p: 0 } }}>
            <thead>
              <tr>
                <Box component="th" sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 2, minWidth: 210, textAlign: "left", px: "8px !important" }}>Darbuotojas</Box>
                {data.days.map((d) => (
                  <Tooltip key={d.date} title={d.holiday ? d.holiday_name : d.pre_holiday ? "Prieššventinė diena - darbo laikas trumpinamas 1 val." : ""}>
                    <Box component="th" sx={{ minWidth: 34, bgcolor: d.holiday ? "rgba(229,72,77,0.08)" : d.weekday >= 5 ? "action.hover" : undefined }}>
                      <div>{Number(d.date.slice(8))}</div>
                      <Box sx={{ fontWeight: 400, color: d.holiday ? "error.main" : "text.secondary" }}>{WD[d.weekday]}</Box>
                      {d.pre_holiday && <Box sx={{ fontSize: 9, color: "warning.main", fontWeight: 700 }}>−1 val.</Box>}
                    </Box>
                  </Tooltip>
                ))}
              </tr>
              {types.map((t) => (
                <tr key={`plan-${t.id}`}>
                  <Box component="th" sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 2, textAlign: "left", px: "8px !important", fontWeight: 500 }}>
                    <Stack direction="row" gap={1} alignItems="center">
                      <Box sx={{ width: 22, height: 18, borderRadius: 0.5, bgcolor: color(t.id), color: "#fff", fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: "18px" }}>{t.code}</Box>
                      <Typography fontSize={12} color="text.secondary">Reikia</Typography>
                    </Stack>
                  </Box>
                  {data.days.map((d) => {
                    const sl = slotMap[`${d.date}|${t.id}`];
                    const short = sl && sl.assigned < sl.min;
                    const over = sl && sl.max != null && sl.assigned > sl.max;
                    return (
                      <Box component="td" key={d.date} onClick={(ev) => { if (locked) { setInfo("Paskelbtas grafikas užrakintas - spauskite „Atrakinti“"); return; } setSlotPop({ anchor: ev.currentTarget, date: d.date, shift_type_id: t.id, min: sl?.min ?? 1, max: sl?.max ?? "", short: sl && sl.assigned < sl.min }); }}
                        sx={{ cursor: "pointer", textAlign: "center", height: 26, fontSize: 11, fontWeight: 700,
                              bgcolor: !sl ? undefined : short || over ? "rgba(229,72,77,0.12)" : "rgba(18,165,148,0.12)",
                              color: !sl ? "text.disabled" : short || over ? "error.main" : "success.main",
                              "&:hover": { bgcolor: "action.hover" } }}>
                        {sl ? `${sl.assigned}/${sl.min}${sl.max != null && sl.max !== sl.min ? `–${sl.max}` : ""}` : "·"}
                      </Box>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {data.employees.map((e) => {
                const diff = Number(e.diff);
                return (
                  <tr key={e.id}>
                    <Box component="td" sx={{ position: "sticky", left: 0, bgcolor: "background.paper", zIndex: 1, px: "8px !important", py: "4px !important" }}>
                      <Typography fontSize={13} fontWeight={600} noWrap>{e.name}</Typography>
                      <Stack direction="row" gap={0.5} alignItems="center">
                        <Typography variant="caption" color="text.secondary">{hrs(e.hours)} / {hrs(e.target)}</Typography>
                        {Math.abs(diff) >= 1 && (
                          <Chip size="small" sx={{ height: 16, fontSize: 10 }} color={diff > 0 ? "warning" : "info"}
                            label={`${diff > 0 ? "+" : ""}${Math.round(diff)}`} />
                        )}
                      </Stack>
                    </Box>
                    {data.days.map((d) => {
                      const k = `${e.id}|${d.date}`;
                      const s = cell[k];
                      const absent = e.absences.includes(d.date);
                      const v = viol[k];
                      const rv = ruleViol[k];
                      const t = s && types.find((x) => x.id === s.shift_type_id);
                      const tip = [...(v || []), ...(rv || [])];
                      return (
                        <Tooltip key={d.date} title={tip.length ? tip.join(" · ") : absent ? "Nebuvimas (atostogos, liga ir kt.)" : t ? `${t.name} ${t.start}–${t.end}` : ""}>
                          <Box component="td" onClick={(ev) => {
                              if (locked) { setInfo("Paskelbtas grafikas užrakintas - spauskite „Atrakinti“"); return; }
                              if (!absent || s) setMenu({ anchor: ev.currentTarget, emp: e, date: d.date, shift: s });
                            }}
                            sx={{ cursor: absent ? "default" : "pointer", textAlign: "center", height: 34, position: "relative",
                                  bgcolor: absent ? "action.disabledBackground" : d.holiday ? "rgba(229,72,77,0.05)" : undefined,
                                  outline: v || rv ? "2px solid" : "none", outlineColor: v ? "error.main" : "warning.main", outlineOffset: -2,
                                  "&:hover": { bgcolor: absent ? undefined : "action.hover" } }}>
                            {s && t && (
                              <Box sx={{ mx: "2px", borderRadius: 1, color: "#fff", fontWeight: 700, bgcolor: color(s.shift_type_id), lineHeight: "26px" }}>
                                {t.code}
                              </Box>
                            )}
                            {absent && !s && <Typography fontSize={11} color="text.disabled">–</Typography>}
                            {s?.locked && <LockIcon sx={{ fontSize: 10, position: "absolute", top: 1, right: 1, color: "text.secondary" }} />}
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </Box>
        </Paper>
      )}

      <Stack direction="row" gap={1} flexWrap="wrap" mt={1.5}>
        {types.map((t) => <Chip key={t.id} size="small" label={`${t.code} – ${t.name} ${t.start}–${t.end}`} sx={{ bgcolor: color(t.id), color: "#fff" }} />)}
      </Stack>

      {data.violations.length > 0 && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mt: 2 }}>
          <b>Darbo kodekso pažeidimai ({data.violations.length}):</b>
          {data.violations.slice(0, 8).map((v, i) => {
            const emp = data.employees.find((x) => x.id === v.employee_id);
            return <div key={i}>{emp?.name}: {v.message}</div>;
          })}
        </Alert>
      )}

      {(data.rule_violations || []).length > 0 && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          <b>Plano ir taisyklių neatitikimai ({data.rule_violations.length}):</b>
          {data.rule_violations.slice(0, 8).map((v, i) => {
            const emp = data.employees.find((x) => x.id === v.employee_id);
            return <div key={i}>{v.date}{emp ? ` · ${emp.name}` : ""}: {v.message}</div>;
          })}
          {data.rule_violations.length > 8 && <div>…</div>}
        </Alert>
      )}

      {(data.history || []).length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
          <Typography fontWeight={700} mb={1}>Pakeitimų istorija</Typography>
          {data.history.map((h) => (
            <Box key={h.version} mb={1.5}>
              <Typography fontSize={13} fontWeight={600}>v{h.version} · {String(h.at).slice(0, 16).replace("T", " ")} · {h.reason}{h.by ? ` · ${h.by}` : ""}</Typography>
              {h.items.map((it, i) => (
                <Typography key={i} variant="body2" color={it.late ? "warning.main" : "text.secondary"}>
                  {it.date} · {it.employee}: {it.change}{it.late ? " (įspėta vėliau nei prieš 2 d. d.)" : ""}
                </Typography>
              ))}
            </Box>
          ))}
        </Paper>
      )}

      <Dialog open={!!unlockDlg} onClose={() => setUnlockDlg(null)} fullWidth maxWidth="xs" disableScrollLock>
        <DialogTitle>Kodėl keičiamas paskelbtas grafikas?</DialogTitle>
        <DialogContent>
          {unlockDlg && (
            <Stack gap={1.5} mt={1}>
              {Object.entries(data.reasons || {}).map(([k, v]) => (
                <Paper key={k} variant="outlined" onClick={() => setUnlockDlg({ ...unlockDlg, reason: k })}
                  sx={{ p: 1.5, cursor: "pointer", borderColor: unlockDlg.reason === k ? "primary.main" : "divider", bgcolor: unlockDlg.reason === k ? "action.selected" : undefined }}>
                  <Typography fontSize={14}>{v}</Typography>
                </Paper>
              ))}
              <TextField label="Komentaras (nebūtina)" value={unlockDlg.comment} onChange={(e) => setUnlockDlg({ ...unlockDlg, comment: e.target.value })} />
              <Typography variant="caption" color="text.secondary">
                Pagal DK paskelbtas grafikas keičiamas tik dėl nuo darbdavio nepriklausančių priežasčių, įspėjus darbuotoją
                ne vėliau kaip prieš 2 jo darbo dienas. Priežastis įrašoma į pakeitimų istoriją.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setUnlockDlg(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={() => { act({ action: "unlock", reason: unlockDlg.reason, comment: unlockDlg.comment }); setUnlockDlg(null); }}>Atrakinti</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!lateDlg} onClose={() => setLateDlg(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>Įspėjama vėliau nei prieš 2 darbo dienas</DialogTitle>
        <DialogContent>
          <Typography variant="body2" mb={1}>Šie pakeitimai įsigalioja greičiau nei po 2 darbuotojo darbo dienų:</Typography>
          {(lateDlg || []).map((x, i) => (
            <Typography key={i} variant="body2">• {data.employees.find((e) => e.id === x.employee_id)?.name || x.employee_id} - {x.date}</Typography>
          ))}
          <Alert severity="warning" sx={{ mt: 2 }}>Tęskite tik jei darbuotojai su pakeitimu sutinka (pvz. patys paprašė). Tai bus pažymėta istorijoje.</Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setLateDlg(null)}>Grįžti</Button>
          <Button variant="contained" color="warning" onClick={() => { setLateDlg(null); act({ action: "publish", confirm_late: true }, "Pakeitimai paskelbti"); }}>Darbuotojai sutinka - paskelbti</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!sugg} onClose={() => setSugg(null)} fullWidth maxWidth="sm" disableScrollLock>
        <DialogTitle>{sugg?.from ? "Pakaitinis darbuotojas" : "Kas galėtų dirbti"} · {sugg?.date} · {types.find((t) => t.id === sugg?.shift_type_id)?.name}</DialogTitle>
        <DialogContent>
          {sugg && sugg.items.length === 0 && <Alert severity="info">Laisvų darbuotojų, kurie nepažeistų DK ir būtinų taisyklių, nėra.</Alert>}
          <Stack gap={1}>
            {sugg?.items.map((c) => (
              <Paper key={c.employee_id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" alignItems="center" gap={1.5}>
                  <Box flex={1}>
                    <Typography fontWeight={600}>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {hrs(c.hours)} / {hrs(c.target)} · po pakeitimo {Number(c.after_diff) > 0 ? `+${Math.round(c.after_diff)} val. virš normos` : `${Math.round(c.after_diff)} val. iki normos`}
                    </Typography>
                    {c.warnings.map((w) => <Typography key={w} variant="caption" color="warning.main" display="block">⚠ {w}</Typography>)}
                  </Box>
                  <Button size="small" variant="contained" onClick={() => {
                    act({ action: "replace", date: sugg.date, shift_type_id: sugg.shift_type_id, to_employee_id: c.employee_id, from_employee_id: sugg.from },
                      "Pamaina perkelta - nepamirškite paskelbti pakeitimų");
                    setSugg(null);
                  }}>Paskirti</Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setSugg(null)}>Uždaryti</Button></DialogActions>
      </Dialog>

      <Menu open={!!tplMenu} anchorEl={tplMenu} onClose={() => setTplMenu(null)} disableScrollLock>
        {(data.templates || []).map((t) => (
          <MenuItem key={t.id} onClick={() => { setTplMenu(null); act({ action: "template_apply", template_id: t.id }, `Šablonas „${t.name}“ pritaikytas visam mėnesiui`); }}>
            Pritaikyti visam mėnesiui: {t.name}
          </MenuItem>
        ))}
        {(data.templates || []).length > 0 && <Divider />}
        <MenuItem onClick={() => { setTplMenu(null); setTplDlg({ name: "", week_start: mondays[0] || "" }); }}>Išsaugoti savaitę kaip šabloną…</MenuItem>
      </Menu>

      <Dialog open={!!tplDlg} onClose={() => setTplDlg(null)} fullWidth maxWidth="xs" disableScrollLock>
        <DialogTitle>Savaitės šablonas</DialogTitle>
        <DialogContent>
          {tplDlg && (
            <Stack gap={2} mt={1}>
              <TextField label="Pavadinimas" value={tplDlg.name} onChange={(e) => setTplDlg({ ...tplDlg, name: e.target.value })} placeholder="pvz. Įprasta savaitė" />
              <TextField select label="Savaitė (nuo pirmadienio)" value={tplDlg.week_start} onChange={(e) => setTplDlg({ ...tplDlg, week_start: e.target.value })}
                SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                {mondays.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setTplDlg(null)}>Atšaukti</Button>
          <Button variant="contained" disabled={!tplDlg?.week_start}
            onClick={() => { act({ action: "template_save", name: tplDlg.name, week_start: tplDlg.week_start }, "Šablonas išsaugotas"); setTplDlg(null); }}>Išsaugoti</Button>
        </DialogActions>
      </Dialog>

      <Popover open={!!slotPop} anchorEl={slotPop?.anchor} onClose={() => setSlotPop(null)} disableScrollLock
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }} transformOrigin={{ vertical: "top", horizontal: "center" }}>
        {slotPop && (
          <Stack gap={1.5} sx={{ p: 2, width: 230 }}>
            <Typography fontWeight={700} fontSize={14}>
              {slotPop.date} · {types.find((t) => t.id === slotPop.shift_type_id)?.name}
            </Typography>
            <Stack direction="row" gap={1}>
              <TextField size="small" type="number" label="Reikia nuo" value={slotPop.min} onChange={(e) => setSlotPop({ ...slotPop, min: e.target.value })} inputProps={{ min: 0 }} />
              <TextField size="small" type="number" label="iki" value={slotPop.max} onChange={(e) => setSlotPop({ ...slotPop, max: e.target.value })} inputProps={{ min: 0 }} />
            </Stack>
            {slotPop.short && (
              <Button size="small" variant="outlined" onClick={() => { openSuggest(slotPop.date, slotPop.shift_type_id, null); setSlotPop(null); }}>
                Siūlyti darbuotojų
              </Button>
            )}
            <Stack direction="row" gap={1}>
              <Button size="small" color="error" onClick={() => { act({ action: "slot", date: slotPop.date, shift_type_id: slotPop.shift_type_id, min: 0 }); setSlotPop(null); }}>Pašalinti</Button>
              <Box flex={1} />
              <Button size="small" variant="contained" onClick={() => { act({ action: "slot", date: slotPop.date, shift_type_id: slotPop.shift_type_id, min: Number(slotPop.min || 0), max: slotPop.max === "" ? null : Number(slotPop.max) }); setSlotPop(null); }}>Išsaugoti</Button>
            </Stack>
          </Stack>
        )}
      </Popover>

      <Menu open={!!menu} anchorEl={menu?.anchor} onClose={() => setMenu(null)} disableScrollLock>
        {types.map((t) => (
          <MenuItem key={t.id} selected={menu?.shift?.shift_type_id === t.id}
            onClick={() => { act({ action: "cell", employee_id: menu.emp.id, date: menu.date, shift_type_id: t.id }); setMenu(null); }}>
            <ListItemIcon><Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: color(t.id) }} /></ListItemIcon>
            {t.code} – {t.name} ({t.start}–{t.end})
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { act({ action: "cell", employee_id: menu.emp.id, date: menu.date, shift_type_id: null }); setMenu(null); }}>
          Laisva diena
        </MenuItem>
        {menu?.shift && (
          <MenuItem onClick={() => { openSuggest(menu.date, menu.shift.shift_type_id, menu.emp.id); setMenu(null); }}>
            Siūlyti pakaitinį darbuotoją
          </MenuItem>
        )}
        {menu?.shift && (
          <MenuItem onClick={() => { act({ action: "cell", employee_id: menu.emp.id, date: menu.date, locked: !menu.shift.locked }); setMenu(null); }}>
            <ListItemIcon>{menu.shift.locked ? <LockOpenIcon fontSize="small" /> : <LockIcon fontSize="small" />}</ListItemIcon>
            {menu.shift.locked ? "Atrakinti" : "Užrakinti (perplanuojant nekeisti)"}
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}

// ============================================================
// Taisyklės
// ============================================================

function useRefs() {
  const [refs, setRefs] = useState({ employees: [], positions: [], groups: [], tags: [], shifts: [] });
  useEffect(() => {
    Promise.all([
      payrollApi.employees({ status: "active" }), payrollApi.positions(), payrollApi.positionGroups(),
      payrollApi.tags(), payrollApi.shiftTypes(),
    ]).then(([e, p, g, t, s]) => setRefs({
      employees: list(e), positions: list(p), groups: list(g), tags: list(t), shifts: list(s),
    })).catch(() => {});
  }, []);
  return refs;
}

const TARGET_KEYS = [["employees", "Darbuotojai"], ["positions", "Pareigos"], ["position_groups", "Pareigų grupės"], ["tags", "Žymos"]];

function targetOptions(refs) {
  return [
    ...refs.employees.map((x) => ({ type: "employees", id: x.id, label: x.full_name || `${x.first_name} ${x.last_name}` })),
    ...refs.positions.map((x) => ({ type: "positions", id: x.id, label: x.name })),
    ...refs.groups.map((x) => ({ type: "position_groups", id: x.id, label: `${x.code} ${x.name}` })),
    ...refs.tags.map((x) => ({ type: "tags", id: x.id, label: x.name })),
  ];
}

const toTarget = (vals) => Object.fromEntries(TARGET_KEYS.map(([k]) => [k, vals.filter((v) => v.type === k).map((v) => v.id)]));
const fromTarget = (t, opts) => opts.filter((o) => (t?.[o.type] || []).includes(o.id));

function TargetPicker({ label, value, onChange, options }) {
  return (
    <Autocomplete multiple options={options} value={value} onChange={(_, v) => onChange(v)}
      groupBy={(o) => TARGET_KEYS.find(([k]) => k === o.type)[1]} getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.type === b.type && a.id === b.id}
      renderInput={(p) => <TextField {...p} label={label} placeholder="Darbuotojai, pareigos, grupės ar žymos" />}
      slotProps={{ popper: { disablePortal: false } }} />
  );
}

function describe(rule, meta, refs, opts) {
  if (!meta) return rule.kind;
  const p = rule.params || {};
  const names = (t) => fromTarget(t, opts).map((o) => o.label).join(", ") || "visi";
  const shiftNames = (p.shifts || []).map((id) => refs.shifts.find((s) => s.id === id)?.name).filter(Boolean).join(", ") || "visas";
  return meta.template
    .replace("{target}", names(rule.target)).replace("{target2}", names(rule.target2))
    .replace("{shifts}", shiftNames).replace("{weekdays}", (p.weekdays || []).map((w) => WD[w]).join(", ") || "–")
    .replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? "–") + (k === "per" ? "" : ""));
}

function RuleDialog({ open, onClose, onSaved, catalog, refs, rule }) {
  const opts = useMemo(() => targetOptions(refs), [refs]);
  const [kind, setKind] = useState(null);
  const [f, setF] = useState({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setError("");
    setKind(rule?.kind || null);
    setF(rule ? { ...rule, target: fromTarget(rule.target, opts), target2: fromTarget(rule.target2, opts), params: rule.params || {} }
      : { hard: true, weight: 3, is_active: true, target: [], target2: [], params: {} });
  }, [open, rule, opts]);
  const meta = catalog.rules.find((r) => r.kind === kind);
  const P = (k, v) => setF((s) => ({ ...s, params: { ...s.params, [k]: v } }));
  const num = (k, label) => (
    <TextField key={k} label={label} type="number" value={f.params?.[k] ?? ""} sx={{ width: 160 }}
      onChange={(e) => P(k, e.target.value === "" ? "" : Number(e.target.value))} />
  );

  const save = async () => {
    try {
      await payrollApi.saveRule({ id: rule?.id, kind, hard: f.hard, weight: f.weight, is_active: f.is_active, note: f.note || "",
        valid_from: f.valid_from || null, valid_to: f.valid_to || null,
        target: toTarget(f.target || []), target2: toTarget(f.target2 || []), params: f.params });
      onSaved(); onClose();
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" disableScrollLock>
      <DialogTitle>{rule ? "Taisyklė" : kind ? meta?.label : "Nauja taisyklė"}</DialogTitle>
      <DialogContent dividers>
        {!kind ? (
          <Stack gap={2}>
            {catalog.groups.map((g) => (
              <Box key={g.key}>
                <Typography fontWeight={700} mb={1}>{g.label}</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" }, gap: 1 }}>
                  {catalog.rules.filter((r) => r.group === g.key).map((r) => (
                    <Paper key={r.kind} variant="outlined" onClick={() => setKind(r.kind)}
                      sx={{ p: 1.5, cursor: "pointer", "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" } }}>
                      <Typography fontWeight={600} fontSize={14}>{r.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.template.replace(/\{\w+\}/g, "…")}</Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        ) : (
          <Stack gap={2}>
            <Typography variant="body2" color="text.secondary">{meta?.template.replace(/\{\w+\}/g, "…")}</Typography>
            {meta?.params.includes("target") && <TargetPicker label="Kam taikoma" value={f.target} onChange={(v) => setF((s) => ({ ...s, target: v }))} options={opts} />}
            {meta?.params.includes("target2") && <TargetPicker label="Su kuo" value={f.target2} onChange={(v) => setF((s) => ({ ...s, target2: v }))} options={opts} />}
            {meta?.params.includes("shifts") && (
              <Autocomplete multiple options={refs.shifts} getOptionLabel={(s) => `${s.code} – ${s.name}`}
                value={refs.shifts.filter((s) => (f.params.shifts || []).includes(s.id))}
                onChange={(_, v) => P("shifts", v.map((s) => s.id))}
                renderInput={(p) => <TextField {...p} label="Pamainos" placeholder="Tuščia - visos" />} />
            )}
            {meta?.params.includes("weekdays") && (
              <Box>
                <Typography variant="caption" color="text.secondary">Savaitės dienos (nepažymėjus - visos)</Typography>
                <ToggleButtonGroup size="small" value={f.params.weekdays || []} onChange={(_, v) => P("weekdays", v)} sx={{ display: "flex" }}>
                  {WD.map((w, i) => <ToggleButton key={i} value={i} sx={{ flex: 1 }}>{w}</ToggleButton>)}
                </ToggleButtonGroup>
              </Box>
            )}
            <Stack direction="row" gap={2} flexWrap="wrap">
              {meta?.params.includes("min") && num("min", "Nuo")}
              {meta?.params.includes("max") && num("max", "Iki")}
              {meta?.params.includes("n") && num("n", "Skaičius (N)")}
              {meta?.params.includes("work") && num("work", "Dirba dienų")}
              {meta?.params.includes("rest") && num("rest", "Ilsisi dienų")}
              {meta?.params.includes("per") && (
                <TextField select label="Per" value={f.params.per || "week"} onChange={(e) => P("per", e.target.value)} sx={{ width: 160 }}
                  SelectProps={{ MenuProps: { disableScrollLock: true } }}>
                  <MenuItem value="week">savaitę</MenuItem><MenuItem value="month">mėnesį</MenuItem>
                </TextField>
              )}
              {meta?.params.includes("date_from") && <LtDatePicker label="Nuo" value={f.params.date_from || null} onChange={(v) => P("date_from", v)} />}
              {meta?.params.includes("date_to") && <LtDatePicker label="Iki" value={f.params.date_to || null} onChange={(v) => P("date_to", v)} />}
            </Stack>
            <Divider />
            <Stack direction={{ xs: "column", sm: "row" }} gap={3} alignItems={{ sm: "center" }}>
              <ToggleButtonGroup exclusive size="small" value={f.hard ? "hard" : "soft"} onChange={(_, v) => v && setF((s) => ({ ...s, hard: v === "hard" }))}>
                <ToggleButton value="hard">Būtina</ToggleButton>
                <ToggleButton value="soft">Pageidautina</ToggleButton>
              </ToggleButtonGroup>
              {!f.hard && (
                <Box sx={{ width: 220 }}>
                  <Typography variant="caption" color="text.secondary">Svarba</Typography>
                  <Slider size="small" min={1} max={5} step={1} marks value={f.weight || 3} onChange={(_, v) => setF((s) => ({ ...s, weight: v }))} />
                </Box>
              )}
              <FormControlLabel control={<Switch checked={!!f.is_active} onChange={(e) => setF((s) => ({ ...s, is_active: e.target.checked }))} />} label="Aktyvi" />
            </Stack>
            <TextField label="Pastaba" value={f.note || ""} onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {kind && !rule && <Button onClick={() => setKind(null)}>Atgal</Button>}
        <Box flex={1} />
        <Button onClick={onClose}>Atšaukti</Button>
        {kind && <Button variant="contained" onClick={save}>Išsaugoti</Button>}
      </DialogActions>
    </Dialog>
  );
}

function RulesTab() {
  const refs = useRefs();
  const opts = useMemo(() => targetOptions(refs), [refs]);
  const [catalog, setCatalog] = useState(null);
  const [rules, setRules] = useState([]);
  const [dlg, setDlg] = useState(null); // {rule}
  const load = () => payrollApi.rules().then((r) => setRules(list(r)));
  useEffect(() => { payrollApi.rosterCatalog().then(setCatalog); load(); }, []);
  if (!catalog) return <CircularProgress />;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography color="text.secondary" variant="body2">Taisyklės įvedamos vieną kartą - sistema jų laikosi sudarydama kiekvieno mėnesio grafiką.</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ rule: null })}>Taisyklė</Button>
      </Stack>
      <Stack gap={1}>
        {rules.length === 0 && <Alert severity="info">Taisyklių dar nėra. Pradėkite nuo „Darbuotojų skaičius pamainoje“.</Alert>}
        {rules.map((r) => {
          const meta = catalog.rules.find((x) => x.kind === r.kind);
          return (
            <Paper key={r.id} variant="outlined" sx={{ p: 1.5, opacity: r.is_active ? 1 : 0.55 }}>
              <Stack direction="row" alignItems="center" gap={1.5}>
                <Box flex={1}>
                  <Typography fontWeight={600} fontSize={14}>{describe(r, meta, refs, opts)}</Typography>
                  <Typography variant="caption" color="text.secondary">{meta?.label}{r.note ? ` · ${r.note}` : ""}</Typography>
                </Box>
                <Chip size="small" color={r.hard ? "primary" : "default"} label={r.hard ? "Būtina" : `Pageidautina · ${r.weight}`} />
                <IconButton size="small" onClick={() => setDlg({ rule: r })}><EditOutlinedIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => payrollApi.deleteRule(r.id).then(load)}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
      <Paper variant="outlined" sx={{ p: 2, mt: 3, bgcolor: "action.hover" }}>
        <Typography fontWeight={700} mb={1}>Visada taikoma (Darbo kodeksas ir DokSkenas duomenys)</Typography>
        {catalog.law.map((l) => <Typography key={l} variant="body2">• {l}</Typography>)}
      </Paper>
      <RuleDialog open={!!dlg} rule={dlg?.rule} onClose={() => setDlg(null)} onSaved={load} catalog={catalog} refs={refs} />
    </Box>
  );
}

// ============================================================
// Pamainos ir žymos
// ============================================================

function SetupTab() {
  const [types, setTypes] = useState([]);
  const [tags, setTags] = useState([]);
  const [dlg, setDlg] = useState(null);
  const [tagName, setTagName] = useState("");
  const [error, setError] = useState("");
  const load = () => {
    payrollApi.shiftTypes().then((r) => setTypes(list(r)));
    payrollApi.tags().then((r) => setTags(list(r)));
  };
  useEffect(load, []);

  const save = async () => {
    try { await payrollApi.saveShiftType(dlg); setDlg(null); load(); } catch (e) { setError(apiError(e)); }
  };

  return (
    <Stack gap={3}>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography fontWeight={700}>Pamainų tipai</Typography>
          <Button startIcon={<AddIcon />} onClick={() => { setError(""); setDlg({ name: "", code: "", start_time: "07:00", end_time: "19:00", break_minutes: 0, color: "" }); }}>Pamaina</Button>
        </Stack>
        <Stack gap={1}>
          {types.map((t, i) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" alignItems="center" gap={1.5}>
                <Box sx={{ width: 30, height: 24, borderRadius: 1, bgcolor: t.color || PALETTE[i % PALETTE.length], color: "#fff", fontWeight: 700, textAlign: "center", lineHeight: "24px" }}>{t.code}</Box>
                <Typography flex={1}>{t.name} · {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}{t.break_minutes ? ` · pertrauka ${t.break_minutes} min.` : ""}</Typography>
                <IconButton size="small" onClick={() => { setError(""); setDlg(t); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => payrollApi.deleteShiftType(t.id).then(load)}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
            </Paper>
          ))}
          {types.length === 0 && <Alert severity="info">Sukurkite pamainas, pvz. „Diena 07:00–19:00“ ir „Naktis 19:00–07:00“.</Alert>}
        </Stack>
      </Box>

      <Box>
        <Typography fontWeight={700} mb={1}>Darbuotojų žymos</Typography>
        <Typography variant="body2" color="text.secondary" mb={1}>Pvz. „Naujokai“, „Turi krautuvo teises“. Žymos priskiriamos darbuotojo kortelėje ir naudojamos taisyklėse.</Typography>
        <Stack direction="row" gap={1} flexWrap="wrap" mb={1}>
          {tags.map((t) => <Chip key={t.id} label={t.name} onDelete={() => payrollApi.deleteTag(t.id).then(load)} />)}
        </Stack>
        <Stack direction="row" gap={1}>
          <TextField size="small" label="Nauja žyma" value={tagName} onChange={(e) => setTagName(e.target.value)} />
          <Button disabled={!tagName.trim()} onClick={() => payrollApi.saveTag({ name: tagName.trim() }).then(() => { setTagName(""); load(); })}>Pridėti</Button>
        </Stack>
      </Box>

      <Dialog open={!!dlg} onClose={() => setDlg(null)} fullWidth maxWidth="xs" disableScrollLock>
        <DialogTitle>{dlg?.id ? "Pamaina" : "Nauja pamaina"}</DialogTitle>
        <DialogContent>
          {dlg && (
            <Stack gap={2} mt={1}>
              <TextField label="Pavadinimas" value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })} />
              <TextField label="Trumpinys grafike" value={dlg.code} inputProps={{ maxLength: 4 }} onChange={(e) => setDlg({ ...dlg, code: e.target.value.toUpperCase() })} />
              <Stack direction="row" gap={2}>
                <TextField label="Pradžia" type="time" value={dlg.start_time.slice(0, 5)} onChange={(e) => setDlg({ ...dlg, start_time: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
                <TextField label="Pabaiga" type="time" value={dlg.end_time.slice(0, 5)} onChange={(e) => setDlg({ ...dlg, end_time: e.target.value })} fullWidth InputLabelProps={{ shrink: true }}
                  helperText={dlg.end_time <= dlg.start_time ? "Baigiasi kitą dieną" : " "} />
              </Stack>
              <TextField label="Pertrauka, min." type="number" value={dlg.break_minutes} onChange={(e) => setDlg({ ...dlg, break_minutes: Number(e.target.value) })} />
              <TextField label="Spalva" type="color" value={dlg.color || "#4C8BF5"} onChange={(e) => setDlg({ ...dlg, color: e.target.value })} />
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDlg(null)}>Atšaukti</Button>
          <Button variant="contained" onClick={save} disabled={!dlg?.name || !dlg?.code}>Išsaugoti</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ============================================================

export default function GrafikaiPage() {
  const [{ year, month }, setYm] = useState(nextMonth);
  const [tab, setTab] = useState(0);
  const shift = (d) => setYm(({ year: y, month: m }) => {
    const x = new Date(y, m - 1 + d, 1);
    return { year: x.getFullYear(), month: x.getMonth() + 1 };
  });

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={2} mb={2}>
        <Typography variant="h5" fontWeight={700}>Darbo grafikai</Typography>
        {tab === 0 && (
          <Stack direction="row" alignItems="center" gap={1}>
            <IconButton onClick={() => shift(-1)}><ChevronLeftIcon /></IconButton>
            <Typography fontWeight={700} sx={{ minWidth: 150, textAlign: "center" }}>{year} m. {MONTHS[month - 1].toLowerCase()}</Typography>
            <IconButton onClick={() => shift(1)}><ChevronRightIcon /></IconButton>
          </Stack>
        )}
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Grafikas" />
        <Tab label="Taisyklės" />
        <Tab label="Pamainos ir žymos" />
      </Tabs>
      {tab === 0 && <RosterTab key={`${year}-${month}`} year={year} month={month} />}
      {tab === 1 && <RulesTab />}
      {tab === 2 && <SetupTab />}
    </Box>
  );
}
