import React, { useState, useCallback, useEffect, useMemo, memo } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Grid2,
    LinearProgress,
    Paper,
    Stack,
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
import { alpha } from "@mui/material/styles";
import SendIcon from "@mui/icons-material/Send";
import GroupIcon from "@mui/icons-material/Group";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import RefreshIcon from "@mui/icons-material/Refresh";
import { api } from "../api/endpoints";

const SOURCE_OPTIONS = [
    { value: "skaitmenizavimas", label: "Skaitmenizavimas" },
    { value: "israsymas", label: "Išrašymas" },
    { value: "null", label: "Nenustatytas" },
];

const STATUS_CONFIG = {
    draft:   { label: "Juodraštis", color: "default",  icon: HourglassEmptyIcon },
    sending: { label: "Siunčiama",  color: "info",     icon: HourglassEmptyIcon },
    paused:  { label: "Pristabdyta", color: "warning", icon: PauseCircleIcon },
    done:    { label: "Baigta",     color: "success",   icon: CheckCircleIcon },
    failed:  { label: "Klaida",     color: "error",     icon: ErrorIcon },
};

const SourceFilter = memo(function SourceFilter({
    selectedSources,
    onToggleSource,
    onClearSources,
}) {
    return (
        <Box>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={2}
                sx={{ mb: 1.5 }}
            >
                <Stack direction="row" spacing={1} alignItems="center">
                    <FilterAltOutlinedIcon color="action" fontSize="small" />
                    <Typography variant="subtitle1" fontWeight={800}>
                        Gavėjų filtras
                    </Typography>
                </Stack>

                {!!selectedSources.length && (
                    <Button
                        size="small"
                        onClick={onClearSources}
                        sx={{ borderRadius: 999 }}
                    >
                        Išvalyti
                    </Button>
                )}
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {SOURCE_OPTIONS.map((option) => {
                    const selected = selectedSources.includes(option.value);
                    return (
                        <Chip
                            key={option.value}
                            label={option.label}
                            clickable
                            color={selected ? "primary" : "default"}
                            variant={selected ? "filled" : "outlined"}
                            onClick={() => onToggleSource(option.value)}
                            sx={{ borderRadius: 999, fontWeight: 700, px: 0.5 }}
                        />
                    );
                })}
            </Stack>
        </Box>
    );
});

const SummaryCard = memo(function SummaryCard({
    loadingCount,
    recipientCount,
    selectedSourceLabels,
    excludeIds,
    subjectReady,
    bodyReady,
    batchEnabled,
    batchSize,
    batchCount,
}) {
    return (
        <Card
            elevation={0}
            sx={(theme) => ({
                borderRadius: 4,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: "background.paper",
            })}
        >
            <CardContent sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="subtitle1" fontWeight={800}>
                        Siuntimo santrauka
                    </Typography>

                    <Box>
                        <Typography variant="caption" color="text.secondary">
                            Gavėjai
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <GroupIcon color="action" fontSize="small" />
                            <Typography variant="h5" fontWeight={900}>
                                {loadingCount ? "..." : recipientCount ?? "-"}
                            </Typography>
                        </Stack>
                    </Box>

                    <Divider />

                    <Box>
                        <Typography variant="caption" color="text.secondary">
                            Registracijos šaltinis
                        </Typography>
                        <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                            {selectedSourceLabels}
                        </Typography>
                    </Box>

                    <Box>
                        <Typography variant="caption" color="text.secondary">
                            Exclude IDs
                        </Typography>
                        <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                            {excludeIds.length ? excludeIds.join(", ") : "Nėra"}
                        </Typography>
                    </Box>

                    {batchEnabled && (
                        <Box>
                            <Typography variant="caption" color="text.secondary">
                                Partijos
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                <ScheduleSendIcon color="action" fontSize="small" />
                                <Typography variant="body2" fontWeight={700}>
                                    {batchCount
                                        ? `${batchCount} × ${batchSize} laiškų (kas 25 val.)`
                                        : `po ${batchSize} laiškų`}
                                </Typography>
                            </Stack>
                        </Box>
                    )}

                    <Box>
                        <Typography variant="caption" color="text.secondary">
                            Laiško būsena
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                            <Chip
                                size="small"
                                label={subjectReady ? "Tema užpildyta" : "Trūksta temos"}
                                color={subjectReady ? "success" : "default"}
                                variant={subjectReady ? "filled" : "outlined"}
                            />
                            <Chip
                                size="small"
                                label={bodyReady ? "Žinutė užpildyta" : "Trūksta žinutės"}
                                color={bodyReady ? "success" : "default"}
                                variant={bodyReady ? "filled" : "outlined"}
                            />
                        </Stack>
                    </Box>
                </Stack>
            </CardContent>
        </Card>
    );
});

const CampaignTable = memo(function CampaignTable({ campaigns, loading, onRefresh }) {
    if (!campaigns.length && !loading) return null;

    return (
        <Paper
            elevation={0}
            sx={(theme) => ({
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 4,
                overflow: "hidden",
                mt: 3,
            })}
        >
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 3, py: 2 }}
            >
                <Typography variant="subtitle1" fontWeight={800}>
                    Kampanijos
                </Typography>
                <Button
                    size="small"
                    startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
                    onClick={onRefresh}
                    disabled={loading}
                    sx={{ borderRadius: 999 }}
                >
                    Atnaujinti
                </Button>
            </Stack>

            <TableContainer>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>ID</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Tema</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Būsena</TableCell>
                            <TableCell sx={{ fontWeight: 800 }} align="center">Progresas</TableCell>
                            <TableCell sx={{ fontWeight: 800 }} align="right">Išsiųsta</TableCell>
                            <TableCell sx={{ fontWeight: 800 }} align="right">Klaidos</TableCell>
                            <TableCell sx={{ fontWeight: 800 }} align="right">Iš viso</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Sukurta</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {campaigns.map((c) => {
                            const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft;
                            const Icon = cfg.icon;
                            return (
                                <TableRow key={c.id} hover>
                                    <TableCell>#{c.id}</TableCell>
                                    <TableCell>
                                        <Tooltip title={c.subject} arrow>
                                            <Typography
                                                variant="body2"
                                                noWrap
                                                sx={{ maxWidth: 220 }}
                                            >
                                                {c.subject}
                                            </Typography>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            icon={<Icon fontSize="small" />}
                                            label={cfg.label}
                                            color={cfg.color}
                                            variant="outlined"
                                            sx={{ fontWeight: 700, borderRadius: 999 }}
                                        />
                                    </TableCell>
                                    <TableCell align="center" sx={{ minWidth: 120 }}>
                                        <Stack spacing={0.5}>
                                            <LinearProgress
                                                variant="determinate"
                                                value={c.progress || 0}
                                                sx={{ height: 6, borderRadius: 3 }}
                                            />
                                            <Typography variant="caption" color="text.secondary">
                                                {c.progress}%
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant="body2" fontWeight={700} color="success.main">
                                            {c.sent_count}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography
                                            variant="body2"
                                            fontWeight={700}
                                            color={c.failed_count > 0 ? "error.main" : "text.secondary"}
                                        >
                                            {c.failed_count}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">{c.total_recipients}</TableCell>
                                    <TableCell>
                                        <Typography variant="caption" color="text.secondary">
                                            {new Date(c.created_at).toLocaleString("lt-LT", {
                                                month: "2-digit",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
});

const ResultAlerts = memo(function ResultAlerts({ error, result, onClearError, onClearResult }) {
    if (!error && !result) return null;

    return (
        <Stack spacing={1.5}>
            {error && (
                <Alert severity="error" onClose={onClearError} sx={{ borderRadius: 3 }}>
                    {error}
                </Alert>
            )}
            {result && (
                <Alert severity="success" onClose={onClearResult} sx={{ borderRadius: 3 }}>
                    Kampanija #{result.campaign_id} sukurta — {result.total_recipients} gavėjų.
                </Alert>
            )}
        </Stack>
    );
});

export default function NewsletterPage() {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [excludeIdsRaw, setExcludeIdsRaw] = useState("");
    const [selectedSources, setSelectedSources] = useState([]);
    const [recipientCount, setRecipientCount] = useState(null);
    const [loadingCount, setLoadingCount] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendingTest, setSendingTest] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [batchEnabled, setBatchEnabled] = useState(false);
    const [batchSize, setBatchSize] = useState(190);
    const [campaigns, setCampaigns] = useState([]);
    const [loadingCampaigns, setLoadingCampaigns] = useState(false);

    const excludeIds = useMemo(() => {
        return excludeIdsRaw
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .map(Number)
            .filter((v) => Number.isInteger(v) && v > 0);
    }, [excludeIdsRaw]);

    const subjectReady = subject.trim().length > 0;
    const bodyReady = body.trim().length > 0;
    const canSubmit = subjectReady && bodyReady;

    const batchCount = batchEnabled && recipientCount
        ? Math.ceil(recipientCount / batchSize)
        : null;

    const selectedSourceLabels = useMemo(() => {
        if (!selectedSources.length) return "Visi šaltiniai";
        return SOURCE_OPTIONS
            .filter((o) => selectedSources.includes(o.value))
            .map((o) => o.label)
            .join(", ");
    }, [selectedSources]);

    const fetchCount = useCallback(async () => {
        setLoadingCount(true);
        try {
            const params = new URLSearchParams();
            selectedSources.forEach((s) => params.append("sources", s));
            if (excludeIds.length) params.set("exclude_ids", excludeIds.join(","));
            const query = params.toString();
            const res = await api.get(`/admin/newsletter/${query ? `?${query}` : ""}`);
            setRecipientCount(res.data.recipient_count);
        } catch {
            setRecipientCount(null);
        } finally {
            setLoadingCount(false);
        }
    }, [selectedSources, excludeIds]);

    const fetchCampaigns = useCallback(async () => {
        setLoadingCampaigns(true);
        try {
            const res = await api.get("/admin/newsletter/?list=1");
            setCampaigns(res.data.campaigns || []);
        } catch {
            console.error("Failed to load campaigns");
        } finally {
            setLoadingCampaigns(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(fetchCount, 400);
        return () => clearTimeout(timer);
    }, [fetchCount]);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    // Auto-refresh campaigns every 30s if any are sending
    useEffect(() => {
        const hasSending = campaigns.some((c) => c.status === "sending");
        if (!hasSending) return;
        const interval = setInterval(fetchCampaigns, 30000);
        return () => clearInterval(interval);
    }, [campaigns, fetchCampaigns]);

    const handleTestSend = async () => {
        if (!canSubmit) { setError("Užpildykite temą ir žinutę."); return; }
        setSendingTest(true);
        setError(null);
        setResult(null);
        try {
            const res = await api.put("/admin/newsletter/", {
                subject: subject.trim(),
                body,
                exclude_user_ids: [],
                registration_sources: [],
            });
            setResult({ ...res.data, campaign_id: "TEST", total_recipients: 1 });
        } catch (e) {
            setError(e.response?.data?.detail || JSON.stringify(e.response?.data) || "Klaida siunčiant testą.");
        } finally {
            setSendingTest(false);
        }
    };

    const handleSend = async () => {
        setConfirmOpen(false);
        setSending(true);
        setError(null);
        setResult(null);
        try {
            const res = await api.post("/admin/newsletter/", {
                subject: subject.trim(),
                body,
                exclude_user_ids: excludeIds,
                registration_sources: selectedSources,
                batch_size: batchEnabled ? batchSize : null,
            });
            setResult(res.data);
            fetchCampaigns();
        } catch (e) {
            setError(e.response?.data?.detail || JSON.stringify(e.response?.data) || "Klaida siunčiant.");
        } finally {
            setSending(false);
        }
    };

    return (
        <Box
            sx={(theme) => ({
                minHeight: "100vh",
                py: { xs: 3, md: 6 },
                px: 2,
                background:
                    theme.palette.mode === "dark"
                        ? `linear-gradient(180deg, ${alpha(theme.palette.grey[900], 0.6)} 0%, ${theme.palette.background.default} 280px)`
                        : `linear-gradient(180deg, ${theme.palette.grey[100]} 0%, ${theme.palette.background.default} 280px)`,
            })}
        >
            <Box sx={{ maxWidth: 1120, mx: "auto" }}>
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", md: "center" }}
                    spacing={2}
                    sx={{ mb: 3 }}
                >
                    <Box>
                        <Typography
                            variant="overline"
                            sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: 1.4 }}
                        >
                            Admin panel
                        </Typography>
                        <Typography variant="h4" fontWeight={800} sx={{ mt: 0.5 }}>
                            Newsletter
                        </Typography>
                        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
                            Paruoškite, patikrinkite ir išsiųskite laišką pasirinktiems gavėjams.
                        </Typography>
                    </Box>
                    <Chip
                        icon={loadingCount ? <CircularProgress size={16} /> : <GroupIcon />}
                        label={loadingCount ? "Skaičiuojama..." : `Gavėjų: ${recipientCount ?? "-"}`}
                        color="default"
                        variant="outlined"
                        sx={{ height: 40, borderRadius: 999, fontWeight: 700, px: 1, bgcolor: "background.paper" }}
                    />
                </Stack>

                <Grid2 container spacing={3}>
                    <Grid2 size={{ xs: 12, md: 8 }}>
                        <Paper
                            elevation={0}
                            sx={(theme) => ({
                                overflow: "hidden",
                                border: `1px solid ${theme.palette.divider}`,
                                borderRadius: 4,
                                bgcolor: "background.paper",
                                boxShadow: `0 18px 50px ${alpha(theme.palette.common.black, 0.06)}`,
                            })}
                        >
                            {(sending || sendingTest) && <LinearProgress />}
                            <Box sx={{ p: { xs: 2.5, md: 3 } }}>
                                <Stack spacing={3}>
                                    <SourceFilter
                                        selectedSources={selectedSources}
                                        onToggleSource={useCallback((v) => {
                                            setSelectedSources((prev) =>
                                                prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]
                                            );
                                        }, [])}
                                        onClearSources={useCallback(() => setSelectedSources([]), [])}
                                    />

                                    <TextField
                                        label="Exclude user IDs"
                                        placeholder="1, 42, 99"
                                        fullWidth
                                        size="small"
                                        value={excludeIdsRaw}
                                        onChange={useCallback((e) => setExcludeIdsRaw(e.target.value), [])}
                                        helperText={
                                            excludeIds.length
                                                ? `${excludeIds.length} vartotojų bus praleista`
                                                : "Įveskite ID per kablelį, jei norite praleisti konkrečius vartotojus"
                                        }
                                    />

                                    <Box
                                        sx={(theme) => ({
                                            p: 2,
                                            borderRadius: 3,
                                            border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
                                            bgcolor: alpha(theme.palette.warning.main, 0.04),
                                        })}
                                    >
                                        <Stack
                                            direction="row"
                                            alignItems="center"
                                            justifyContent="space-between"
                                        >
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={800}>
                                                    Siųsti dalimis
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Mailjet Free: 200 el. laiškų/d. Siunčiama kas 25 val.
                                                </Typography>
                                            </Box>
                                            <Chip
                                                label={batchEnabled ? "Įjungta" : "Išjungta"}
                                                clickable
                                                color={batchEnabled ? "warning" : "default"}
                                                variant={batchEnabled ? "filled" : "outlined"}
                                                onClick={() => setBatchEnabled((v) => !v)}
                                                sx={{ borderRadius: 999, fontWeight: 700 }}
                                            />
                                        </Stack>
                                        {batchEnabled && (
                                            <TextField
                                                label="Partijos dydis"
                                                type="number"
                                                size="small"
                                                value={batchSize}
                                                onChange={(e) => {
                                                    const v = parseInt(e.target.value, 10);
                                                    if (v > 0 && v <= 500) setBatchSize(v);
                                                }}
                                                inputProps={{ min: 1, max: 500 }}
                                                helperText={
                                                    batchCount
                                                        ? `${batchCount} partij${batchCount === 1 ? "a" : "os"}, ~${Math.max(batchCount - 1, 0)} d. trukmė`
                                                        : "Kiek laiškų siųsti per vieną partiją"
                                                }
                                                sx={{ mt: 2, width: 200 }}
                                            />
                                        )}
                                    </Box>

                                    <Divider />

                                    <TextField
                                        label="Tema"
                                        fullWidth
                                        size="small"
                                        value={subject}
                                        onChange={useCallback((e) => setSubject(e.target.value), [])}
                                    />
                                    <TextField
                                        label="Žinutė"
                                        placeholder="Įrašykite newsletter tekstą..."
                                        fullWidth
                                        multiline
                                        minRows={10}
                                        maxRows={22}
                                        value={body}
                                        onChange={useCallback((e) => setBody(e.target.value), [])}
                                        helperText="Plain text formatas"
                                    />

                                    <Stack
                                        direction={{ xs: "column", sm: "row" }}
                                        spacing={1.5}
                                        justifyContent="flex-end"
                                    >
                                        <Button
                                            variant="outlined"
                                            size="large"
                                            startIcon={sendingTest ? <CircularProgress size={18} color="inherit" /> : <MailOutlineIcon />}
                                            onClick={handleTestSend}
                                            disabled={sendingTest || sending || !canSubmit}
                                            sx={{ borderRadius: 2, px: 3, fontWeight: 800 }}
                                        >
                                            {sendingTest ? "Siunčiama..." : "Test email"}
                                        </Button>
                                        <Button
                                            variant="contained"
                                            size="large"
                                            startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
                                            onClick={() => { if (canSubmit) setConfirmOpen(true); else setError("Užpildykite temą ir žinutę."); }}
                                            disabled={sending || sendingTest || !canSubmit}
                                            sx={{ borderRadius: 2, px: 3, fontWeight: 800, boxShadow: "none" }}
                                        >
                                            {sending ? "Siunčiama..." : "Siųsti"}
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Box>
                        </Paper>
                    </Grid2>

                    <Grid2 size={{ xs: 12, md: 4 }}>
                        <Stack spacing={2}>
                            <SummaryCard
                                loadingCount={loadingCount}
                                recipientCount={recipientCount}
                                selectedSourceLabels={selectedSourceLabels}
                                excludeIds={excludeIds}
                                subjectReady={subjectReady}
                                bodyReady={bodyReady}
                                batchEnabled={batchEnabled}
                                batchSize={batchSize}
                                batchCount={batchCount}
                            />
                            <ResultAlerts
                                error={error}
                                result={result}
                                onClearError={useCallback(() => setError(null), [])}
                                onClearResult={useCallback(() => setResult(null), [])}
                            />
                        </Stack>
                    </Grid2>
                </Grid2>

                <CampaignTable
                    campaigns={campaigns}
                    loading={loadingCampaigns}
                    onRefresh={fetchCampaigns}
                />
            </Box>

            <Dialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                maxWidth="xs"
                fullWidth
                disableScrollLock
                PaperProps={{ sx: { borderRadius: 4 } }}
            >
                <DialogTitle sx={{ pb: 1 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                        <WarningAmberRoundedIcon color="warning" />
                        <Typography variant="h6" fontWeight={900}>
                            Patvirtinti siuntimą
                        </Typography>
                    </Stack>
                </DialogTitle>
                <DialogContent>
                    <Typography color="text.secondary">
                        Ar tikrai norite išsiųsti laišką{" "}
                        <strong>{recipientCount ?? "?"}</strong> gavėjams?
                        {batchEnabled && batchCount > 1 && (
                            <>
                                {" "}Laiškai bus siunčiami {batchCount} partijomis po {batchSize}, kas 25 val.
                            </>
                        )}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button
                        onClick={() => setConfirmOpen(false)}
                        sx={{ borderRadius: 2, fontWeight: 800 }}
                    >
                        Atšaukti
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSend}
                        startIcon={<SendIcon />}
                        sx={{ borderRadius: 2, fontWeight: 800, boxShadow: "none" }}
                    >
                        Siųsti
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}