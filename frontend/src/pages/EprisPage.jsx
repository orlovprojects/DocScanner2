import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell,
    TableContainer, Paper, CircularProgress, Stack, Alert, Chip, Tooltip,
    MenuItem, Select, InputLabel, FormControl, Checkbox, FormControlLabel,
    IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { api } from '../api/endpoints';

const LANGUAGES = ['LT', 'EN', 'DE', 'PL', 'FR'];

const QUARTER_LABELS = {
    1: 'I ketv. (Sausis – Kovas)',
    2: 'II ketv. (Balandis – Birželis)',
    3: 'III ketv. (Liepa – Rugsėjis)',
    4: 'IV ketv. (Spalis – Gruodis)',
};

function quarterDates(year, q) {
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const lastDay = new Date(year, endMonth, 0).getDate();
    return {
        date_from: `${year}-${String(startMonth).padStart(2, '0')}-01`,
        date_to: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
}

// ──────────────────────────────────────────────
// Kategorijų dialogas
// ──────────────────────────────────────────────

function EprisCodesDialog({ open, onClose, doc, onSaved }) {
    const [categories, setCategories] = useState([]);
    const [requiresSubcodes, setRequiresSubcodes] = useState(false);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState([]);

    const country = (doc?.seller_country_iso || '').toUpperCase();

    useEffect(() => {
        if (!open || !country) return;
        setLoading(true);
        api.get('/epris/code-options/', { params: { country } })
            .then((res) => {
                setCategories(res.data.categories);
                setRequiresSubcodes(res.data.requires_subcodes);
            })
            .catch(() => setCategories([]))
            .finally(() => setLoading(false));
    }, [open, country]);

    useEffect(() => {
        if (!open) return;
        const existing = doc?.epris_codes;
        setRows(existing?.length
            ? existing.map((r) => ({ ...r }))
            : [{ code: '', subcode: '', free_text: '', language: '' }]);
        setErrors([]);
    }, [open, doc]);

    const catByCode = useCallback(
        (code) => categories.find((c) => c.code === code) || null,
        [categories],
    );

    const updateRow = (idx, patch) => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    };

    const handleCategoryChange = (idx, code) => {
        updateRow(idx, { code, subcode: '', free_text: '', language: '' });
    };

    const rowError = (row) => {
        if (!row.code) return 'Pasirinkite kategoriją';
        const cat = catByCode(row.code);
        if (!cat) return null;
        if (cat.subcode_required && !row.subcode) {
            if (row.code === '10' && row.free_text) return null;
            return `${country} reikalauja subkodo`;
        }
        if (row.code === '10' && !row.subcode && !row.free_text) {
            return 'Būtinas subkodas arba aprašymas';
        }
        if (row.free_text && !row.language) return 'Nurodykite kalbą';
        return null;
    };

    const localErrors = rows.map(rowError);
    const canSave = rows.length > 0 && localErrors.every((e) => !e);

    const handleSave = async () => {
        setSaving(true);
        setErrors([]);
        try {
            const res = await api.patch(`/epris/documents/${doc.id}/codes/`, { codes: rows });
            if (res.data.errors?.length) {
                setErrors(res.data.errors);
            } else {
                onSaved?.(res.data);
                onClose();
            }
        } catch (err) {
            setErrors([err.response?.data?.error || 'Klaida išsaugant']);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth disableScrollLock>
            <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="h6" fontWeight={700}>
                    EPRIS kategorijos
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {doc?.seller_name} · {country} · {doc?.document_series}{doc?.document_number}
                </Typography>
            </DialogTitle>

            <DialogContent dividers>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    {/* Peržiūra */}
                    <Paper
                        variant="outlined"
                        sx={{
                            width: { xs: '100%', md: 380 },
                            flexShrink: 0,
                            height: 480,
                            overflow: 'hidden',
                            bgcolor: 'grey.50',
                        }}
                    >
                        {doc?.preview_url ? (
                            <Box
                                component="iframe"
                                src={doc.preview_url}
                                title="Dokumentas"
                                sx={{ width: '100%', height: '100%', border: 0 }}
                            />
                        ) : (
                            <Box sx={{ p: 3, textAlign: 'center' }}>
                                <Typography variant="body2" color="text.secondary">
                                    Peržiūra nepasiekiama
                                </Typography>
                            </Box>
                        )}
                    </Paper>

                    {/* Kodai */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : (
                            <Stack spacing={2}>
                                <Chip
                                    size="small"
                                    variant="outlined"
                                    color={requiresSubcodes ? 'warning' : 'success'}
                                    label={requiresSubcodes
                                        ? `${country}: kai kurioms kategorijoms reikia subkodų`
                                        : `${country}: subkodų nereikia`}
                                    sx={{ alignSelf: 'flex-start' }}
                                />

                                {rows.map((row, idx) => {
                                    const cat = catByCode(row.code);
                                    const err = localErrors[idx];

                                    return (
                                        <Paper key={idx} variant="outlined" sx={{ p: 1.5 }}>
                                            <Stack spacing={1.5}>
                                                <Stack direction="row" spacing={1} alignItems="flex-start">
                                                    <FormControl size="small" fullWidth>
                                                        <InputLabel>Kategorija</InputLabel>
                                                        <Select
                                                            value={row.code}
                                                            label="Kategorija"
                                                            onChange={(e) => handleCategoryChange(idx, e.target.value)}
                                                            MenuProps={{ disableScrollLock: true }}
                                                        >
                                                            {categories.map((c) => (
                                                                <MenuItem key={c.code} value={c.code}>
                                                                    {c.label}
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => setRows((p) => p.filter((_, i) => i !== idx))}
                                                        disabled={rows.length === 1}
                                                    >
                                                        <DeleteOutlineIcon fontSize="small" />
                                                    </IconButton>
                                                </Stack>

                                                {cat?.subcode_required && (
                                                    <FormControl size="small" fullWidth error={!!err && !row.subcode}>
                                                        <InputLabel>Subkodas *</InputLabel>
                                                        <Select
                                                            value={row.subcode}
                                                            label="Subkodas *"
                                                            onChange={(e) => updateRow(idx, { subcode: e.target.value })}
                                                            MenuProps={{ disableScrollLock: true, sx: { maxHeight: 420 } }}
                                                        >
                                                            {cat.options.map((o) => (
                                                                <MenuItem
                                                                    key={o.value}
                                                                    value={o.value}
                                                                    sx={{ pl: 1 + (o.level - 2) * 2, whiteSpace: 'normal' }}
                                                                >
                                                                    <Box>
                                                                        <Typography variant="body2">{o.label}</Typography>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {o.path}
                                                                        </Typography>
                                                                    </Box>
                                                                </MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                )}

                                                {row.code === '10' && (
                                                    <Stack direction="row" spacing={1}>
                                                        <TextField
                                                            size="small"
                                                            fullWidth
                                                            label={cat?.subcode_required
                                                                ? 'Aprašymas (vietoj subkodo)'
                                                                : 'Aprašymas *'}
                                                            value={row.free_text}
                                                            onChange={(e) => updateRow(idx, { free_text: e.target.value })}
                                                        />
                                                        <FormControl size="small" sx={{ width: 110 }}>
                                                            <InputLabel>Kalba</InputLabel>
                                                            <Select
                                                                value={row.language}
                                                                label="Kalba"
                                                                onChange={(e) => updateRow(idx, { language: e.target.value })}
                                                                MenuProps={{ disableScrollLock: true }}
                                                            >
                                                                {LANGUAGES.map((l) => (
                                                                    <MenuItem key={l} value={l}>{l}</MenuItem>
                                                                ))}
                                                            </Select>
                                                        </FormControl>
                                                    </Stack>
                                                )}

                                                {err && (
                                                    <Typography variant="caption" color="error">
                                                        {err}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Paper>
                                    );
                                })}

                                <Button
                                    size="small"
                                    startIcon={<AddIcon fontSize="small" />}
                                    onClick={() => setRows((p) => [
                                        ...p,
                                        { code: '', subcode: '', free_text: '', language: '' },
                                    ])}
                                    sx={{ alignSelf: 'flex-start' }}
                                >
                                    Pridėti kategoriją
                                </Button>

                                {errors.length > 0 && (
                                    <Alert severity="error">
                                        {errors.map((e, i) => <div key={i}>{e}</div>)}
                                    </Alert>
                                )}
                            </Stack>
                        )}
                    </Box>
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} size="small">Atšaukti</Button>
                <Button
                    variant="contained"
                    size="small"
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
                >
                    Išsaugoti
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ──────────────────────────────────────────────
// Puslapis
// ──────────────────────────────────────────────

export default function EprisPage() {
    const [overview, setOverview] = useState([]);
    const [loadingOverview, setLoadingOverview] = useState(true);
    const [includeSubmitted, setIncludeSubmitted] = useState(false);

    const [selected, setSelected] = useState(null);
    const [periodValue, setPeriodValue] = useState('');

    const [data, setData] = useState(null);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState('');

    const [dialogDoc, setDialogDoc] = useState(null);

    const loadOverview = useCallback(async () => {
        setLoadingOverview(true);
        try {
            const res = await api.get('/epris/overview/', {
                params: includeSubmitted ? { include_submitted: 1 } : {},
            });
            setOverview(res.data.rows);
        } catch (err) {
            setError('Klaida gaunant suvestinę');
        } finally {
            setLoadingOverview(false);
        }
    }, [includeSubmitted]);

    useEffect(() => { loadOverview(); }, [loadOverview]);

    const periodOptions = useMemo(() => {
        if (!selected) return [];
        const row = overview.find(
            (r) => r.country === selected.country && r.year === selected.year,
        );
        if (!row) return [];
        const opts = [];
        if (row.annual_eligible) {
            opts.push({
                value: 'year',
                label: `${row.year} m. (metinis, min. 50 €)`,
                date_from: `${row.year}-01-01`,
                date_to: `${row.year}-12-31`,
            });
        }
        row.quarters.forEach((q) => {
            if (!q.eligible) return;
            opts.push({
                value: `Q${q.quarter}`,
                label: `${row.year} m. ${QUARTER_LABELS[q.quarter]} — ${q.vat_eur} €`,
                ...quarterDates(row.year, q.quarter),
            });
        });
        return opts;
    }, [selected, overview]);

    const resolvedPeriod = useMemo(
        () => periodOptions.find((o) => o.value === periodValue) || null,
        [periodOptions, periodValue],
    );

    const loadDocuments = useCallback(async () => {
        if (!selected || !resolvedPeriod) return;
        setLoadingDocs(true);
        setError('');
        try {
            const res = await api.post('/epris/documents/', {
                country: selected.country,
                date_from: resolvedPeriod.date_from,
                date_to: resolvedPeriod.date_to,
                include_submitted: includeSubmitted,
                offset: 0,
                limit: 200,
            });
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Klaida gaunant dokumentus');
        } finally {
            setLoadingDocs(false);
        }
    }, [selected, resolvedPeriod, includeSubmitted]);

    const handleSelectCountry = (row) => {
        setSelected({ country: row.country, year: row.year });
        setPeriodValue('');
        setData(null);
    };

    const handleDownload = async () => {
        if (!selected || !resolvedPeriod) return;
        setDownloading(true);
        try {
            const res = await api.post('/epris/export/', {
                country: selected.country,
                date_from: resolvedPeriod.date_from,
                date_to: resolvedPeriod.date_to,
            }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute(
                'download',
                `EPRIS_${selected.country}_${resolvedPeriod.date_from}_${resolvedPeriod.date_to}.csv`,
            );
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            await loadDocuments();
            await loadOverview();
        } catch (err) {
            setError('Klaida generuojant failą');
        } finally {
            setDownloading(false);
        }
    };

    const handleCodesSaved = (payload) => {
        setData((prev) => {
            if (!prev) return prev;
            const entries = prev.entries.map((e) =>
                e.id === payload.id
                    ? { ...e, epris_codes: payload.epris_codes, epris_status: payload.epris_status }
                    : e,
            );
            return {
                ...prev,
                entries,
                ready_count: entries.filter((e) => e.epris_status === 'tinkama').length,
            };
        });
    };

    const fmt = (v) => parseFloat(v || 0).toLocaleString('lt-LT', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    });

    const allReady = data && data.total_count > 0 && data.ready_count === data.total_count;

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', py: 3, px: 2 }}>
            <Typography variant="h5" fontWeight={700} gutterBottom>
                Užsienio PVM grąžinimas (EPRIS)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Vienas failas – viena šalis ir vienas laikotarpis
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Suvestinė */}
            <Paper sx={{ p: 2.5, mb: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle1" fontWeight={700}>
                        Galimai grąžintinas PVM
                    </Typography>
                    <FormControlLabel
                        control={
                            <Checkbox
                                size="small"
                                checked={includeSubmitted}
                                onChange={(e) => setIncludeSubmitted(e.target.checked)}
                            />
                        }
                        label={<Typography variant="body2">Rodyti jau eksportuotus</Typography>}
                    />
                </Stack>

                {loadingOverview ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Šalis</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Metai</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="center">Dok.</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="center">Paruošta</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="right">PVM (EUR)</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Galimas prašymas</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Terminas</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {overview.map((row) => {
                                    const isSel = selected?.country === row.country && selected?.year === row.year;
                                    const eligible = row.annual_eligible || row.quarterly_eligible;
                                    return (
                                        <TableRow
                                            key={`${row.country}-${row.year}`}
                                            hover
                                            selected={isSel}
                                            sx={{ opacity: row.deadline_ok ? 1 : 0.45 }}
                                        >
                                            <TableCell>{row.country_name}</TableCell>
                                            <TableCell>{row.year}</TableCell>
                                            <TableCell align="center">{row.doc_count}</TableCell>
                                            <TableCell align="center">{row.ready_count}</TableCell>
                                            <TableCell align="right">{fmt(row.vat_eur)}</TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                                    {row.annual_eligible && (
                                                        <Chip size="small" label="Metinis" color="success" variant="outlined" />
                                                    )}
                                                    {row.quarterly_eligible && (
                                                        <Chip size="small" label="Ketvirtinis" color="primary" variant="outlined" />
                                                    )}
                                                    {!eligible && (
                                                        <Chip size="small" label="Nesiekia ribos" variant="outlined" />
                                                    )}
                                                </Stack>
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="caption"
                                                    color={row.deadline_ok ? 'text.secondary' : 'error'}
                                                >
                                                    {row.deadline}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button
                                                    size="small"
                                                    variant={isSel ? 'contained' : 'outlined'}
                                                    disabled={!eligible || !row.deadline_ok}
                                                    onClick={() => handleSelectCountry(row)}
                                                    sx={{ fontSize: '0.75rem' }}
                                                >
                                                    Pasirinkti
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {overview.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">
                                                Nėra dokumentų su užsienio ES PVM
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Laikotarpis */}
            {selected && (
                <Paper sx={{ p: 2.5, mb: 3 }}>
                    <Stack spacing={2}>
                        <FormControl size="small" sx={{ width: { xs: '100%', sm: 400 } }}>
                            <InputLabel>Laikotarpis</InputLabel>
                            <Select
                                value={periodValue}
                                label="Laikotarpis"
                                onChange={(e) => { setPeriodValue(e.target.value); setData(null); }}
                                MenuProps={{ disableScrollLock: true }}
                            >
                                {periodOptions.map((o) => (
                                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={loadingDocs
                                    ? <CircularProgress size={16} color="inherit" />
                                    : <PlayArrowIcon fontSize="small" />}
                                onClick={loadDocuments}
                                disabled={!resolvedPeriod || loadingDocs}
                            >
                                Rodyti dokumentus
                            </Button>
                            {data && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={downloading
                                        ? <CircularProgress size={16} />
                                        : <DownloadIcon fontSize="small" />}
                                    onClick={handleDownload}
                                    disabled={downloading || !allReady || !data.threshold_met}
                                >
                                    Generuoti EPRIS failą
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </Paper>
            )}

            {/* Dokumentai */}
            {data && (
                <Box>
                    <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                        <Chip
                            label={`Viso: ${fmt(data.total_vat_eur)} €`}
                            color={data.threshold_met ? 'success' : 'default'}
                        />
                        <Chip label={`Paruošta: ${data.ready_count} / ${data.total_count}`} variant="outlined" />
                        <Chip label={`Valiuta: ${data.currency}`} variant="outlined" />
                    </Stack>

                    {!data.threshold_met && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            Suma nesiekia {fmt(data.threshold)} € ribos šiam laikotarpiui
                        </Alert>
                    )}
                    {data.threshold_met && !allReady && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Priskirkite kategorijas visiems dokumentams, kad galėtumėte generuoti failą
                        </Alert>
                    )}

                    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700, width: 50 }}>Nr.</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Data</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Dokumentas</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Tiekėjas</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>PVM kodas</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="right">Be PVM</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="right">PVM</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Kategorijos</TableCell>
                                    <TableCell sx={{ fontWeight: 700, width: 70 }} />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {data.entries.map((e, idx) => (
                                    <TableRow
                                        key={e.id}
                                        hover
                                        sx={{ bgcolor: e.warnings.length ? 'warning.50' : 'inherit' }}
                                    >
                                        <TableCell>{idx + 1}</TableCell>
                                        <TableCell>{e.invoice_date}</TableCell>
                                        <TableCell>{`${e.document_series}${e.document_number}`}</TableCell>
                                        <TableCell
                                            sx={{
                                                maxWidth: 180,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {e.seller_name}
                                        </TableCell>
                                        <TableCell>{e.seller_vat_code}</TableCell>
                                        <TableCell align="right">{fmt(e.amount_wo_vat)}</TableCell>
                                        <TableCell align="right">{fmt(e.vat_amount)}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                                {(e.epris_codes || []).map((c, i) => (
                                                    <Chip
                                                        key={i}
                                                        size="small"
                                                        label={c.subcode || c.code}
                                                        color="primary"
                                                        variant="outlined"
                                                    />
                                                ))}
                                                {!e.epris_codes?.length && (
                                                    <Chip size="small" label="Nepriskirta" color="warning" />
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={0.5}>
                                                <IconButton size="small" onClick={() => setDialogDoc(e)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                {e.epris_status === 'tinkama' && (
                                                    <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                                )}
                                                {e.warnings.length > 0 && (
                                                    <Tooltip title={e.warnings.join('; ')} arrow>
                                                        <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {data.entries.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">
                                                Nėra dokumentų šiam laikotarpiui
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            <EprisCodesDialog
                open={!!dialogDoc}
                doc={dialogDoc}
                onClose={() => setDialogDoc(null)}
                onSaved={handleCodesSaved}
            />
        </Box>
    );
}