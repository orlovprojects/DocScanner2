import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    Box, Typography, TextField, Autocomplete, Chip, Button,
    Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
    Paper, CircularProgress, Stack, Alert, Card, CardContent, Tooltip,
    MenuItem, Select, InputLabel, FormControl, IconButton,
    Checkbox, FormControlLabel, FormGroup,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/lt';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { api } from '../api/endpoints';

const PAGE_SIZE = 25;
const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const CURRENT_QUARTER = Math.ceil((NOW.getMonth() + 1) / 3);

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

function buildPeriodOptions() {
    const opts = [];

    // Текущий год — все кварталы до текущего включительно
    for (let q = CURRENT_QUARTER; q >= 1; q--) {
        opts.push({
            value: `${CURRENT_YEAR}-Q${q}`,
            label: `${CURRENT_YEAR} m. ${QUARTER_LABELS[q]}`,
            ...quarterDates(CURRENT_YEAR, q),
        });
    }

    // Прошлый год — все 4 квартала
    for (let q = 4; q >= 1; q--) {
        opts.push({
            value: `${CURRENT_YEAR - 1}-Q${q}`,
            label: `${CURRENT_YEAR - 1} m. ${QUARTER_LABELS[q]}`,
            ...quarterDates(CURRENT_YEAR - 1, q),
        });
    }

    // Ещё два года целиком
    for (let y = CURRENT_YEAR - 2; y >= CURRENT_YEAR - 3; y--) {
        opts.push({
            value: String(y),
            label: `${y} m.`,
            date_from: `${y}-01-01`,
            date_to: `${y}-12-31`,
        });
    }

    opts.push({ value: 'custom', label: 'Pagal datas', date_from: null, date_to: null });
    return opts;
}

const PERIOD_OPTIONS = buildPeriodOptions();
const DEFAULT_PERIOD = `${CURRENT_YEAR}-Q${CURRENT_QUARTER}`;

export default function OSSReportPage() {
    // ── Контрагенты ──
    const [contractorOptions, setContractorOptions] = useState([]);
    const [selectedContractors, setSelectedContractors] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchInput, setSearchInput] = useState('');

    // ── Параметры ──
    const [period, setPeriod] = useState(DEFAULT_PERIOD);
    const [dateFrom, setDateFrom] = useState(null);
    const [dateTo, setDateTo] = useState(null);

    // ── Источники ──
    const [srcSkaitmenizavimas, setSrcSkaitmenizavimas] = useState(true);
    const [srcIsrasymas, setSrcIsrasymas] = useState(true);

    // ── Данные ──
    const [summaryRows, setSummaryRows] = useState([]);
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

    // ── Даты из периода ──
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

    // ── Поиск контрагентов ──
    const searchContractors = useCallback(async (query) => {
        if (query.length < 2) {
            setContractorOptions([]);
            return;
        }
        setSearchLoading(true);
        try {
            const res = await api.get('/oss-report/contractors/', { params: { q: query } });
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

    // ── Генерация ──
    const handleGenerate = async () => {
        if (!selectedContractors.length || !sources.length) return;
        setGenerating(true);
        setError('');
        setEntries([]);
        setSummaryRows([]);
        setGrandTotals(null);
        setGenerated(false);

        try {
            const res = await api.post('/oss-report/generate/', {
                ...getPayload(),
                offset: 0,
                limit: PAGE_SIZE,
            });
            setSummaryRows(res.data.summary);
            setGrandTotals(res.data.grand_totals);
            setEntries(res.data.entries);
            setTotalCount(res.data.total_count);
            setGenerated(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Klaida generuojant OSS ataskaitą');
        } finally {
            setGenerating(false);
        }
    };

    // ── Подгрузка ──
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const res = await api.post('/oss-report/generate/', {
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

    // ── Скачивание ──
    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await api.post('/oss-report/export/', getPayload(), { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'oss_ataskaita.xlsx');
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
                    OSS žurnalas
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    ES pardavimai fiziniams asmenims (B2C) - One Stop Shop deklaracijai
                </Typography>

                <Paper sx={{ p: 2.5, mb: 3 }}>
                    <Stack spacing={2.5}>
                        {/* ── Контрагенты ── */}
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            options={contractorOptions}
                            getOptionLabel={(o) =>
                                `${o.display_name || ''}${o.code ? ` (${o.code})` : ''}` +
                                `${o.vat ? ` [${o.vat}]` : ''} — ${o.oss_count || 0} OSS / ${o.count} visų dok.`
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
                                    label="Pasirinkite pardavėjo įmonę bei jos variacijas"
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

                        {/* ── Laikotarpis (кварталы) ── */}
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

                        {/* ── Кнопки ── */}
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

                {/* ── OSS suvestinė ── */}
                {generated && summaryRows.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                            OSS suvestinė
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
                                        <TableCell sx={{ fontWeight: 700 }}>Vartojimo valstybė narė</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="center">Dok.</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">PVM tarifas, %</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">Apmokestinamoji vertė (EUR)</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">PVM suma (EUR)</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {summaryRows.map((row, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{row.buyer_country_name}</TableCell>
                                            <TableCell align="center">{row.doc_count}</TableCell>
                                            <TableCell align="right">{fmtAmount(row.vat_percent)}</TableCell>
                                            <TableCell align="right">{fmtAmount(row.taxable_amount)}</TableCell>
                                            <TableCell align="right">{fmtAmount(row.vat_amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {grandTotals && (
                                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                                            <TableCell sx={{ fontWeight: 700 }}>Viso:</TableCell>
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
                        {grandTotals && grandTotals.warnings_count > 0 && (
                            <Alert severity="warning" sx={{ mt: 1 }}>
                                {grandTotals.warnings_count} {docWord(grandTotals.warnings_count)} su keliais skirtingais PVM – reikia peržiūrėti rankiniu būdu
                            </Alert>
                        )}
                    </Box>
                )}

                {/* ── Таблица документов ── */}
                {generated && (
                    <Box>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                            Dokumentai
                        </Typography>
                        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700, width: 60 }}>Nr.</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Data</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Serija ir numeris</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Pirkėjas</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Šalis</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">PVM %</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">Vertė (EUR)</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }} align="right">PVM (EUR)</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Šaltinis</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {entries.map((entry, idx) => {
                                        const isDup = entry.is_duplicate;
                                        const hasWarn = !!entry.warning;

                                        return (
                                            <TableRow
                                                key={`${entry.source}-${entry.doc_id}-${idx}`}
                                                hover
                                                sx={{
                                                    opacity: isDup ? 0.5 : 1,
                                                    bgcolor: hasWarn ? 'warning.50' : isDup ? 'action.hover' : 'inherit',
                                                }}
                                            >
                                                <TableCell>{idx + 1}</TableCell>
                                                <TableCell>{entry.invoice_date}</TableCell>
                                                <TableCell>{entry.serija_nr}</TableCell>
                                                <TableCell
                                                    sx={{
                                                        maxWidth: 180,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {entry.buyer_name}
                                                </TableCell>
                                                <TableCell>{entry.buyer_country_name}</TableCell>
                                                <TableCell align="right">
                                                    {entry.vat_percent ? fmtAmount(entry.vat_percent) : ''}
                                                </TableCell>
                                                <TableCell align="right">{fmtAmount(entry.taxable_amount)}</TableCell>
                                                <TableCell align="right">{fmtAmount(entry.vat_amount)}</TableCell>
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
                                                        {hasWarn && (
                                                            <Tooltip title={entry.warning} arrow>
                                                                <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                                                            </Tooltip>
                                                        )}
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {entries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">
                                                    Nėra OSS dokumentų pagal pasirinktus filtrus
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