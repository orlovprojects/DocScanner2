import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    Box, Typography, TextField, Autocomplete, Chip, Button,
    Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
    Paper, CircularProgress, Stack, Alert, Tooltip,
    MenuItem, Select, InputLabel, FormControl, IconButton,
    Checkbox, FormControlLabel, FormGroup,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/lt';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { api } from '../api/endpoints';

const PAGE_SIZE = 25;
const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const CURRENT_MONTH = NOW.getMonth() + 1; // 1-12

const MONTH_NAMES_LT = {
    1: 'Sausis', 2: 'Vasaris', 3: 'Kovas', 4: 'Balandis',
    5: 'Gegužė', 6: 'Birželis', 7: 'Liepa', 8: 'Rugpjūtis',
    9: 'Rugsėjis', 10: 'Spalis', 11: 'Lapkritis', 12: 'Gruodis',
};

function monthDates(year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    return {
        date_from: `${year}-${String(month).padStart(2, '0')}-01`,
        date_to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
}

function buildPeriodOptions() {
    const opts = [];
    // Paskutiniai 6 užbaigti mėnesiai
    let year = CURRENT_YEAR;
    let month = CURRENT_MONTH - 1; // praėjęs mėnuo
    if (month <= 0) { month = 12; year--; }

    for (let i = 0; i < 6; i++) {
        opts.push({
            value: `${year}-${String(month).padStart(2, '0')}`,
            label: `${year} m. ${MONTH_NAMES_LT[month]}`,
            ...monthDates(year, month),
        });
        month--;
        if (month <= 0) { month = 12; year--; }
    }

    opts.push({ value: 'custom', label: 'Pagal datas', date_from: null, date_to: null });
    return opts;
}

const PERIOD_OPTIONS = buildPeriodOptions();
const DEFAULT_PERIOD = PERIOD_OPTIONS.length > 1 ? PERIOD_OPTIONS[0].value : 'custom';

const SVS_CODE_COLORS = {
    '140': { bg: '#E3F2FD', color: '#1565C0' },
    '141': { bg: '#FFF3E0', color: '#E65100' },
    '043': { bg: '#E8F5E9', color: '#2E7D32' },
};

function SvsCodeChip({ code }) {
    const style = SVS_CODE_COLORS[code] || { bg: '#F5F5F5', color: '#616161' };
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-block',
                px: 1, py: 0.25,
                borderRadius: 1,
                fontSize: '0.75rem',
                fontWeight: 700,
                bgcolor: style.bg,
                color: style.color,
            }}
        >
            {code}
        </Box>
    );
}

export default function SVSReportPage() {
    // ── Kontrahentai ──
    const [contractorOptions, setContractorOptions] = useState([]);
    const [selectedContractors, setSelectedContractors] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchInput, setSearchInput] = useState('');

    // ── Parametrai ──
    const [period, setPeriod] = useState(DEFAULT_PERIOD);
    const [dateFrom, setDateFrom] = useState(null);
    const [dateTo, setDateTo] = useState(null);

    // ── Šaltiniai ──
    const [srcSkaitmenizavimas, setSrcSkaitmenizavimas] = useState(true);
    const [srcIsrasymas, setSrcIsrasymas] = useState(true);

    // ── Duomenys ──
    const [pvm101Summary, setPvm101Summary] = useState([]);
    const [fr0564Summary, setFr0564Summary] = useState([]);
    const [grandTotals, setGrandTotals] = useState(null);
    const [entries, setEntries] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [generating, setGenerating] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(false);

    // ── Infinite scroll ──
    const observerRef = useRef(null);
    const sentinelRef = useRef(null);
    const hasMore = entries.length < totalCount;

    // ── Datos iš laikotarpio ──
    const resolvedDates = useMemo(() => {
        if (period === 'custom') {
            return {
                date_from: dateFrom ? dayjs(dateFrom).format('YYYY-MM-DD') : null,
                date_to: dateTo ? dayjs(dateTo).format('YYYY-MM-DD') : null,
            };
        }
        const opt = PERIOD_OPTIONS.find((o) => o.value === period);
        return opt ? { date_from: opt.date_from, date_to: opt.date_to } : { date_from: null, date_to: null };
    }, [period, dateFrom, dateTo]);

    const sources = useMemo(() => {
        const s = [];
        if (srcSkaitmenizavimas) s.push('skaitmenizavimas');
        if (srcIsrasymas) s.push('israsymas');
        return s;
    }, [srcSkaitmenizavimas, srcIsrasymas]);

    // ── Kontrahentų paieška ──
    const searchContractors = useCallback(async (query) => {
        if (query.length < 2) {
            setContractorOptions([]);
            return;
        }
        setSearchLoading(true);
        try {
            const res = await api.get('/svs-report/contractors/', { params: { q: query } });
            setContractorOptions(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setSearchLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchInput) searchContractors(searchInput);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput, searchContractors]);

    // ── Payload ──
    const getPayload = useCallback(() => ({
        contractor_keys: selectedContractors.map((c) => c.key),
        date_from: resolvedDates.date_from,
        date_to: resolvedDates.date_to,
        sources,
    }), [selectedContractors, resolvedDates, sources]);

    // ── Generavimas ──
    const handleGenerate = async () => {
        if (!selectedContractors.length || !sources.length) return;
        setGenerating(true);
        setError('');
        setEntries([]);
        setPvm101Summary([]);
        setFr0564Summary([]);
        setGrandTotals(null);
        setGenerated(false);

        try {
            const res = await api.post('/svs-report/generate/', {
                ...getPayload(),
                offset: 0,
                limit: PAGE_SIZE,
            });
            setPvm101Summary(res.data.pvm101_summary);
            setFr0564Summary(res.data.fr0564_summary);
            setGrandTotals(res.data.grand_totals);
            setEntries(res.data.entries);
            setTotalCount(res.data.total_count);
            setGenerated(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Klaida generuojant SVS ataskaitą');
        } finally {
            setGenerating(false);
        }
    };

    // ── Papildomas krovimas ──
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const res = await api.post('/svs-report/generate/', {
                ...getPayload(),
                offset: entries.length,
                limit: PAGE_SIZE,
            });
            setEntries((prev) => [...prev, ...res.data.entries]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMore, entries.length, getPayload]);

    // ── IntersectionObserver ──
    useEffect(() => {
        if (!generated) return;
        if (observerRef.current) observerRef.current.disconnect();
        observerRef.current = new IntersectionObserver(
            (intersections) => {
                if (intersections[0]?.isIntersecting && hasMore && !loadingMore) loadMore();
            },
            { threshold: 0.1 },
        );
        if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
        return () => observerRef.current?.disconnect();
    }, [generated, hasMore, loadingMore, loadMore]);

    // ── Excel eksportas ──
    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await api.post('/svs-report/export/', getPayload(), { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'svs_ataskaita.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
        } finally {
            setDownloading(false);
        }
    };

    const fmtAmount = (val) => {
        if (val == null || val === '') return '';
        return parseFloat(val).toLocaleString('lt-LT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const docWord = (n) => {
        n = parseInt(n, 10) || 0;
        const m10 = n % 10;
        const m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return 'dokumentas';
        if (m10 >= 2 && m10 <= 9 && !(m100 >= 12 && m100 <= 19)) return 'dokumentai';
        return 'dokumentų';
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
            <Box sx={{ maxWidth: 1100, mx: 'auto', py: 3, px: 2 }}>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                    SVS žurnalas
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    PVM101 deklaracija ir FR0564 ataskaita - paslaugų įsigijimas iš užsienio ir teikimas ES PVM mokėtojams
                </Typography>

                <Paper sx={{ p: 2.5, mb: 3 }}>
                    <Stack spacing={2.5}>
                        {/* ── Kontrahentai ── */}
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            options={contractorOptions}
                            getOptionLabel={(o) =>
                                `${o.display_name || ''}${o.code ? ` (${o.code})` : ''}` +
                                `${o.vat ? ` [${o.vat}]` : ''} - ${o.svs_count || 0} SVS / ${o.count} visų dok.`
                            }
                            isOptionEqualToValue={(opt, val) => opt.key === val.key}
                            value={selectedContractors}
                            onChange={(_, val) => setSelectedContractors(val)}
                            onInputChange={(_, val, reason) => {
                                if (reason === 'input') setSearchInput(val);
                            }}
                            loading={searchLoading}
                            filterOptions={(x) => x}
                            noOptionsText={
                                searchInput.length < 2
                                    ? 'Įveskite bent 2 simbolius'
                                    : searchLoading ? 'Ieškoma...' : 'Nieko nerasta'
                            }
                            renderTags={(value, getTagProps) =>
                                value.map((option, index) => (
                                    <Chip
                                        label={option.display_name || option.key}
                                        size="small"
                                        {...getTagProps({ index })}
                                        key={option.key}
                                    />
                                ))
                            }
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Pasirinkite savo įmonę bei jos variacijas"
                                    placeholder="Ieškoti pagal pavadinimą, kodą arba PVM kodą..."
                                    size="small"
                                />
                            )}
                            slotProps={{
                                popper: { disablePortal: false, style: { zIndex: 1301 } },
                            }}
                        />

                        {/* ── Šaltiniai ── */}
                        <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                Šaltiniai
                            </Typography>
                            <FormGroup row>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={srcSkaitmenizavimas}
                                            onChange={(e) => setSrcSkaitmenizavimas(e.target.checked)}
                                        />
                                    }
                                    label={<Typography variant="body2">Skaitmenizavimas</Typography>}
                                />
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={srcIsrasymas}
                                            onChange={(e) => setSrcIsrasymas(e.target.checked)}
                                        />
                                    }
                                    label={<Typography variant="body2">Išrašymas</Typography>}
                                />
                            </FormGroup>
                        </Box>

                        {/* ── Laikotarpis (mėnesiai) ── */}
                        <Stack spacing={2}>
                            <FormControl size="small" sx={{ width: { xs: '100%', sm: 340 } }}>
                                <InputLabel>Laikotarpis</InputLabel>
                                <Select
                                    value={period}
                                    onChange={(e) => {
                                        setPeriod(e.target.value);
                                        if (e.target.value !== 'custom') {
                                            setDateFrom(null);
                                            setDateTo(null);
                                        }
                                    }}
                                    label="Laikotarpis"
                                    MenuProps={{ disableScrollLock: true }}
                                >
                                    {PERIOD_OPTIONS.map((opt) => (
                                        <MenuItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            {period === 'custom' && (
                                <Stack direction="row" spacing={2}>
                                    <DatePicker
                                        label="Data nuo"
                                        value={dateFrom}
                                        onChange={setDateFrom}
                                        format="YYYY-MM-DD"
                                        slotProps={{
                                            textField: { size: 'small', sx: { width: 170 } },
                                            popper: { disablePortal: false },
                                        }}
                                    />
                                    <DatePicker
                                        label="Data iki"
                                        value={dateTo}
                                        onChange={setDateTo}
                                        format="YYYY-MM-DD"
                                        slotProps={{
                                            textField: { size: 'small', sx: { width: 170 } },
                                            popper: { disablePortal: false },
                                        }}
                                    />
                                </Stack>
                            )}
                        </Stack>

                        {/* ── Mygtukai ── */}
                        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={
                                    generating
                                        ? <CircularProgress size={16} color="inherit" />
                                        : <PlayArrowIcon fontSize="small" />
                                }
                                onClick={handleGenerate}
                                disabled={!selectedContractors.length || !sources.length || generating}
                                sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' } }}
                            >
                                Generuoti
                            </Button>
                            {generated && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={
                                        downloading
                                            ? <CircularProgress size={16} />
                                            : <DownloadIcon fontSize="small" />
                                    }
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' } }}
                                >
                                    Excel
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </Paper>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* ══════════════════════════════════════════════
                    PVM mokėtina suma
                   ══════════════════════════════════════════════ */}
                {generated && grandTotals && parseFloat(grandTotals.vat_amount) > 0 && (
                    <Box
                        sx={{
                            p: 2.5, mb: 3,
                            borderRadius: 2,
                            bgcolor: '#f2f2f2',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        }}
                    >
                        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={2} justifyContent="space-between">
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                                    PVM mokėtina suma už laikotarpį
                                </Typography>
                                <Typography variant="h4" fontWeight={700} sx={{ color: '#fa5f5f' }}>
                                    {fmtAmount(grandTotals.vat_amount)} EUR
                                </Typography>
                            </Box>
                            <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                                <Typography variant="body2" color="text.secondary">
                                    Įmokos kodas: <strong>1001</strong>
                                </Typography>
                                {resolvedDates.date_to && (
                                    <Typography variant="body2" color="text.secondary">
                                        Deklaravimo terminas: <strong>
                                            {(() => {
                                                const d = new Date(resolvedDates.date_to);
                                                let deadlineMonth = d.getMonth() + 2;
                                                let deadlineYear = d.getFullYear();
                                                if (deadlineMonth > 12) { deadlineMonth -= 12; deadlineYear++; }
                                                return `${deadlineYear}-${String(deadlineMonth).padStart(2, '0')}-25`;
                                            })()}
                                        </strong>
                                    </Typography>
                                )}
                            </Box>
                        </Stack>
                    </Box>
                )}

                {/* ══════════════════════════════════════════════
                    PVM101 suvestinė
                   ══════════════════════════════════════════════ */}
                {generated && pvm101Summary.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                            PVM101 suvestinė
                            <Tooltip
                                title="Šias sumas reikia suvesti į EDS PVM101 deklaraciją. Kiekvienam kodui - atskira eilutė."
                                arrow
                            >
                                <HelpOutlineIcon sx={{ fontSize: 16, ml: 0.5, color: 'text.disabled', verticalAlign: 'middle' }} />
                            </Tooltip>
                        </Typography>
                        <TableContainer
                            component={Paper}
                            sx={{
                                border: '2px solid',
                                borderColor: 'primary.main',
                                borderRadius: 2,
                            }}
                        >
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'primary.50' }}>
                                        <TableCell sx={{ fontWeight: 700, width: 70 }}>Kodas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Aprašymas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="center">Dok.</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">PVM %</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">Apmokestinamoji vertė</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">PVM suma</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {pvm101Summary.map((row) => (
                                        <TableRow key={row.code}>
                                            <TableCell><SvsCodeChip code={row.code} /></TableCell>
                                            <TableCell sx={{ fontSize: '0.8125rem' }}>{row.label}</TableCell>
                                            <TableCell align="center">{row.doc_count}</TableCell>
                                            <TableCell align="right">{row.vat_percent}%</TableCell>
                                            <TableCell align="right">{fmtAmount(row.taxable_amount)}</TableCell>
                                            <TableCell align="right">{fmtAmount(row.vat_amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {grandTotals && (
                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                            <TableCell sx={{ fontWeight: 700 }} colSpan={2}>Viso:</TableCell>
                                            <TableCell align="center" sx={{ fontWeight: 700 }}>
                                                {grandTotals.documents_count}
                                            </TableCell>
                                            <TableCell />
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                {fmtAmount(grandTotals.taxable_amount)}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                {fmtAmount(grandTotals.vat_amount)}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        {grandTotals && grandTotals.duplicates_count > 0 && (
                            <Alert severity="info" sx={{ mt: 1 }}>
                                {grandTotals.duplicates_count} {docWord(grandTotals.duplicates_count)} dublikatų (Skaitmenizavimas + Išrašymas) - neįtraukti į sumas
                            </Alert>
                        )}
                    </Box>
                )}

                {/* ══════════════════════════════════════════════
                    FR0564 suvestinė (tik jei yra 043 pardavimų)
                   ══════════════════════════════════════════════ */}
                {generated && fr0564Summary.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                            FR0564 ataskaita
                            <Tooltip
                                title="Prekių tiekimo ir paslaugų teikimo į kitas ES valstybes nares ataskaita. Kiekvienam ES PVM mokėtojui pirkėjui - atskira eilutė."
                                arrow
                            >
                                <HelpOutlineIcon sx={{ fontSize: 16, ml: 0.5, color: 'text.disabled', verticalAlign: 'middle' }} />
                            </Tooltip>
                        </Typography>
                        <TableContainer
                            component={Paper}
                            sx={{
                                border: '2px solid',
                                borderColor: 'success.main',
                                borderRadius: 2,
                            }}
                        >
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'success.50' }}>
                                        <TableCell sx={{ fontWeight: 700 }}>Valstybės kodas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>PVM mokėtojo kodas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Pirkėjas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="center">Dok.</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">Paslaugų vertė (EUR)</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {fr0564Summary.map((row, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{row.country_iso}</TableCell>
                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                                                {row.vat_code}
                                            </TableCell>
                                            <TableCell>{row.buyer_name}</TableCell>
                                            <TableCell align="center">{row.doc_count}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                                                {parseInt(row.services_amount, 10).toLocaleString('lt-LT')}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}

                {/* ══════════════════════════════════════════════
                    Dokumentų lentelė
                   ══════════════════════════════════════════════ */}
                {generated && (
                    <Box>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                            Dokumentai
                        </Typography>
                        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700, width: 50 }}>Nr.</TableCell>
                                        <TableCell sx={{ fontWeight: 700, width: 60 }}>Kodas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Data</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Serija ir numeris</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Kontrahentas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Šalis</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">Vertė (EUR)</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Šaltinis</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {entries.map((entry, idx) => {
                                        const isDup = entry.is_duplicate;

                                        return (
                                            <TableRow
                                                key={`${entry.source}-${entry.doc_id}-${idx}`}
                                                hover
                                                sx={{
                                                    opacity: isDup ? 0.5 : 1,
                                                    bgcolor: isDup ? 'action.hover' : 'inherit',
                                                }}
                                            >
                                                <TableCell>{idx + 1}</TableCell>
                                                <TableCell><SvsCodeChip code={entry.svs_code} /></TableCell>
                                                <TableCell>{entry.invoice_date}</TableCell>
                                                <TableCell>{entry.serija_nr}</TableCell>
                                                <TableCell
                                                    sx={{
                                                        maxWidth: 200,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {entry.counterparty_name}
                                                </TableCell>
                                                <TableCell>{entry.counterparty_country_name}</TableCell>
                                                <TableCell align="right">{fmtAmount(entry.amount_wo_vat)}</TableCell>
                                                <TableCell>
                                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {entry.source === 'israsymas' ? 'Išrašymas' : 'Skaitm.'}
                                                        </Typography>
                                                        {isDup && (
                                                            <Tooltip title="Dublikatas – šis dokumentas jau yra Išrašyme" arrow>
                                                                <ContentCopyIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                                                            </Tooltip>
                                                        )}
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {entries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">
                                                    Nėra SVS dokumentų pagal pasirinktus filtrus
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>

                            <Box ref={sentinelRef} sx={{ height: 1 }} />

                            {loadingMore && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                    <CircularProgress size={24} />
                                </Box>
                            )}

                            {generated && !hasMore && entries.length > 0 && (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: 'block', textAlign: 'center', py: 1.5 }}
                                >
                                    Rodoma {totalCount} {docWord(totalCount)}
                                </Typography>
                            )}
                        </TableContainer>
                    </Box>
                )}
            </Box>
        </LocalizationProvider>
    );
}