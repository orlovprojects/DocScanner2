import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    Box, Typography, TextField, Autocomplete, Chip, Switch,
    Button, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
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
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { api } from "../api/endpoints";

const PAGE_SIZE = 25;
const CURRENT_YEAR = new Date().getFullYear();

const PERIOD_OPTIONS = [
    ...Array.from({ length: 5 }, (_, i) => {
        const y = CURRENT_YEAR - i;
        return { value: String(y), label: `${y} m.` };
    }),
    { value: 'custom', label: 'Pagal datas' },
];

const DEFAULT_PERIOD = String(CURRENT_YEAR - 1);

export default function VeiklosZurnalasPage() {
    // ── Контрагенты ──
    const [contractorOptions, setContractorOptions] = useState([]);
    const [selectedContractors, setSelectedContractors] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchInput, setSearchInput] = useState('');

    // ── Параметры ──
    const [pvmMoketojas, setPvmMoketojas] = useState(false);
    const [period, setPeriod] = useState(DEFAULT_PERIOD);
    const [dateFrom, setDateFrom] = useState(null);
    const [dateTo, setDateTo] = useState(null);

    // ── Источники ──
    const [srcSkaitmenizavimas, setSrcSkaitmenizavimas] = useState(true);
    const [srcIsrasymas, setSrcIsrasymas] = useState(true);

    // ── Данные журнала ──
    const [entries, setEntries] = useState([]);
    const [summary, setSummary] = useState(null);
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

    // ── Вычисление date_from / date_to из period ──
    const resolvedDates = useMemo(() => {
        if (period === 'custom') {
            return {
                date_from: dateFrom ? dayjs(dateFrom).format('YYYY-MM-DD') : null,
                date_to: dateTo ? dayjs(dateTo).format('YYYY-MM-DD') : null,
            };
        }
        const year = parseInt(period, 10);
        return {
            date_from: `${year}-01-01`,
            date_to: `${year}-12-31`,
        };
    }, [period, dateFrom, dateTo]);

    const sources = useMemo(() => {
        const s = [];
        if (srcSkaitmenizavimas) s.push('skaitmenizavimas');
        if (srcIsrasymas) s.push('israsymas');
        return s;
    }, [srcSkaitmenizavimas, srcIsrasymas]);

    // ── Поиск контрагентов (debounce 300ms) ──
    const searchContractors = useCallback(async (query) => {
        if (query.length < 2) {
            setContractorOptions([]);
            return;
        }
        setSearchLoading(true);
        try {
            const res = await api.get('/veiklos-zurnalas/contractors/', {
                params: { q: query },
            });
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

    // ── Payload builder ──
    const getPayload = useCallback(() => ({
        contractor_keys: selectedContractors.map((c) => c.key),
        pvm_moketojas: pvmMoketojas,
        date_from: resolvedDates.date_from,
        date_to: resolvedDates.date_to,
        sources,
    }), [selectedContractors, pvmMoketojas, resolvedDates, sources]);

    // ── Генерация ──
    const handleGenerate = async () => {
        if (!selectedContractors.length || !sources.length) return;
        setGenerating(true);
        setError('');
        setEntries([]);
        setSummary(null);
        setGenerated(false);

        try {
            const res = await api.post('/veiklos-zurnalas/generate/', {
                ...getPayload(),
                offset: 0,
                limit: PAGE_SIZE,
            });
            setSummary(res.data.summary);
            setEntries(res.data.entries);
            setTotalCount(res.data.total_count);
            setGenerated(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Klaida generuojant žurnalą');
        } finally {
            setGenerating(false);
        }
    };

    // ── Подгрузка следующей страницы ──
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const res = await api.post('/veiklos-zurnalas/generate/', {
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
                if (intersections[0]?.isIntersecting && hasMore && !loadingMore) {
                    loadMore();
                }
            },
            { threshold: 0.1 },
        );

        if (sentinelRef.current) {
            observerRef.current.observe(sentinelRef.current);
        }

        return () => observerRef.current?.disconnect();
    }, [generated, hasMore, loadingMore, loadMore]);

    // ── Скачивание XLSX ──
    const handleDownload = async () => {
        setDownloading(true);
        try {
            const res = await api.post('/veiklos-zurnalas/export/', getPayload(), {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'ind_veiklos_zurnalas.xlsx');
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

    // ── Формат суммы ──
    const fmtAmount = (val) => {
        if (val == null) return '';
        return parseFloat(val).toLocaleString('lt-LT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
            <Box sx={{ maxWidth: 1100, mx: 'auto', py: 3, px: 2 }}>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                    Individualios veiklos žurnalas
                </Typography>

                <Paper sx={{ p: 2.5, mb: 3 }}>
                    <Stack spacing={2.5}>
                        {/* ── Контрагенты ── */}
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            options={contractorOptions}
                            getOptionLabel={(o) =>
                                `${o.display_name || ''}${o.code ? ` (${o.code})` : ''}${o.vat ? ` [${o.vat}]` : ''} — ${o.count} dok.`
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
                                    : searchLoading
                                        ? 'Ieškoma...'
                                        : 'Nieko nerasta'
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
                                    label="Pasirinkite savo ind. veiklą"
                                    placeholder="Ieškoti pagal pavadinimą, kodą arba PVM kodą..."
                                    size="small"
                                />
                            )}
                            slotProps={{
                                popper: { disablePortal: false, style: { zIndex: 1301 } },
                            }}
                        />

                        {/* ── PVM mokėtojas + tooltip ── */}
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Switch
                                checked={pvmMoketojas}
                                onChange={(e) => setPvmMoketojas(e.target.checked)}
                            />
                            <Typography variant="body2" color="text.primary">
                                PVM mokėtojas
                            </Typography>
                            <Tooltip
                                title="PVM mokėtojams pajamų ir išlaidų sumos formuojamos be PVM, o ne PVM mokėtojams — sumos įskaito PVM."
                                arrow
                                placement="right"
                            >
                                <IconButton size="small" sx={{ color: 'text.secondary' }}>
                                    <HelpOutlineIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Stack>

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

                        {/* ── Laikotarpis ── */}
                        <Stack spacing={2}>
                            <FormControl size="small" sx={{ width: 220 }}>
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
                        <Stack direction="row" spacing={1.5}>
                            <Button
                                variant="contained"
                                startIcon={
                                    generating
                                        ? <CircularProgress size={18} color="inherit" />
                                        : <PlayArrowIcon />
                                }
                                onClick={handleGenerate}
                                disabled={!selectedContractors.length || !sources.length || generating}
                            >
                                Generuoti
                            </Button>
                            {generated && (
                                <Button
                                    variant="outlined"
                                    startIcon={
                                        downloading
                                            ? <CircularProgress size={18} />
                                            : <DownloadIcon />
                                    }
                                    onClick={handleDownload}
                                    disabled={downloading}
                                >
                                    Atsisiųsti
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </Paper>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* ── Summary карточки ── */}
                {summary && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
                        {[
                            { label: 'Pardavimo operacijos', value: summary.pardavimo_operacijos },
                            { label: 'Pirkimo operacijos', value: summary.pirkimo_operacijos },
                            { label: 'Pajamų suma', value: `${fmtAmount(summary.pajamu_suma)} €` },
                            { label: 'Išlaidų suma', value: `${fmtAmount(summary.islaidu_suma)} €` },
                        ].map((item) => (
                            <Card
                                key={item.label}
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    bgcolor: 'grey.50',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                }}
                            >
                                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                    <Typography variant="caption" color="text.primary">
                                        {item.label}
                                    </Typography>
                                    <Typography variant="h6" fontWeight={700}>
                                        {item.value}
                                    </Typography>
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                )}

                {/* ── Таблица ── */}
                {generated && (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700, width: 70 }}>Eil. Nr.</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Sąskaitos data</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Serija ir numeris</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Pirkėjas/pardavėjas</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Turinys</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="right">Pajamos, EUR</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="right">Išlaidos, EUR</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Šaltinis</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {entries.map((entry, idx) => (
                                    <TableRow key={`${entry.source}-${entry.doc_id}`} hover>
                                        <TableCell>{idx + 1}</TableCell>
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
                                            {entry.counterparty}
                                        </TableCell>
                                        <TableCell>{entry.turinys}</TableCell>
                                        <TableCell align="right">
                                            {entry.pajamos ? fmtAmount(entry.pajamos) : ''}
                                        </TableCell>
                                        <TableCell align="right">
                                            {entry.islaidos ? fmtAmount(entry.islaidos) : ''}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">
                                                {entry.source === 'israsymas' ? 'Išrašymas' : 'Skaitmenizavimas'}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}

                                {entries.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <Typography color="text.secondary">
                                                Nėra operacijų pagal pasirinktus filtrus
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>

                        {/* Sentinel для infinite scroll */}
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
                                Rodoma {totalCount} operacijų
                            </Typography>
                        )}
                    </TableContainer>
                )}
            </Box>
        </LocalizationProvider>
    );
}