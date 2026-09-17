import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import WeekendIcon from "@mui/icons-material/Weekend";
import { fixedAssetsApi } from "../api/fixedAssetsApi";
import { useCompanyProfiles } from "../contexts/useCompanyProfiles";
import { ILT_COLORS } from "../components/IltBanner";
import FixedAssetDetailDialog from "../components/FixedAssetDetailDialog";
import FixedAssetDepreciationPanel from "../components/FixedAssetDepreciationPanel";
import DocumentImageDialog from "../components/DocumentImageDialog";
import FixedAssetManualDialog from "../components/FixedAssetManualDialog";
import AddIcon from "@mui/icons-material/Add";
import {
  AssetStatusChip,
  errorText,
  fmtDate,
  fmtEur,
} from "../components/fixedAssetsUtils";

const headCellSx = { fontWeight: 600, bgcolor: "#f3f4f6" };

function KpiCard({ label, value }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        borderRadius: 2,
        border: `1px solid ${ILT_COLORS.border}`,
        bgcolor: ILT_COLORS.bg,
        flex: "1 1 200px",
      }}
    >
      <Typography sx={{ fontSize: 12, color: ILT_COLORS.text }}>{label}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 700, color: ILT_COLORS.title, mt: 0.25 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function IlgalaikisTurtasPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const { profiles, activeId, initialized } = useCompanyProfiles();
  const activeProfile = profiles.find((p) => p.id === activeId);

  const [tab, setTab] = useState("turtas");
  const [assets, setAssets] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("visi");
  const [groupFilter, setGroupFilter] = useState("visi");

  const [detailId, setDetailId] = useState(null);
  const [purchaseId, setPurchaseId] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);

  const loadAssets = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "visi") params.status = statusFilter;
      if (groupFilter !== "visi") params.group_id = groupFilter;
      const { data } = await fixedAssetsApi.getAssets(params);
      setAssets(data || []);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [activeId, search, statusFilter, groupFilter]);

  useEffect(() => {
    if (!initialized || !activeId) return;
    const timer = setTimeout(loadAssets, search.trim() ? 400 : 0);
    return () => clearTimeout(timer);
  }, [initialized, activeId, loadAssets, search]);

  useEffect(() => {
    if (!initialized || !activeId) return;
    setGroupFilter("visi");
    fixedAssetsApi
      .getGroups()
      .then(({ data }) => setGroups(data || []))
      .catch(() => setGroups([]));
  }, [initialized, activeId]);

  const kpi = useMemo(() => {
    const inUse = assets.filter((a) => a.status === "active" || a.status === "draft");
    const sum = (field) => inUse.reduce((s, a) => s + Number(a[field] || 0), 0);
    return {
      count: inUse.length,
      cost: sum("base_cost"),
      accumulated: sum("accumulated"),
      residual: sum("residual"),
    };
  }, [assets]);

  const hasFilters = Boolean(search) || statusFilter !== "visi" || groupFilter !== "visi";

  if (!initialized) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  const renderAssets = () => (
    <>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <KpiCard label="Turto savikaina" value={fmtEur(kpi.cost)} />
        <KpiCard label="Sukauptas nusidėvėjimas" value={fmtEur(kpi.accumulated)} />
        <KpiCard label="Likutinė vertė" value={fmtEur(kpi.residual)} />
        <KpiCard label="Naudojamo turto vnt." value={kpi.count} />
      </Box>

      <Paper
        elevation={0}
        sx={{
          mb: 2,
          p: isMobile ? 1.5 : 2,
          borderRadius: 2,
          bgcolor: ILT_COLORS.bg,
          border: `1px solid ${ILT_COLORS.border}`,
          display: "flex",
          gap: isMobile ? 1.5 : 2,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <TextField
          size="small"
          placeholder="Ieškoti pagal pavadinimą ar inv. nr..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20, color: "text.disabled" }} />
              </InputAdornment>
            ),
          }}
          sx={{
            flex: isMobile ? "1 1 100%" : "1 1 280px",
            maxWidth: isMobile ? "100%" : 360,
            bgcolor: "white",
            "& .MuiOutlinedInput-root": { borderRadius: 1.5 },
          }}
        />

        <FormControl size="small" sx={{ minWidth: 180, flex: isMobile ? 1 : "none" }}>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            MenuProps={{ disableScrollLock: true }}
            sx={{ bgcolor: "white", borderRadius: 1.5, fontSize: "0.85rem" }}
          >
            <MenuItem value="visi">Statusas: Visi</MenuItem>
            <MenuItem value="active">Eksploatuojamas</MenuItem>
            <MenuItem value="draft">Juodraštis</MenuItem>
            <MenuItem value="sold">Parduotas</MenuItem>
            <MenuItem value="written_off">Nurašytas</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 220, flex: isMobile ? 1 : "none" }}>
          <Select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            MenuProps={{ disableScrollLock: true }}
            sx={{ bgcolor: "white", borderRadius: 1.5, fontSize: "0.85rem" }}
          >
            <MenuItem value="visi">Grupė: Visos</MenuItem>
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>{g.category_display}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : assets.length === 0 ? (
        hasFilters ? (
          <Typography sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
            Pagal pasirinktus filtrus turto nerasta
          </Typography>
        ) : (
          <Box
            sx={{
              textAlign: "center",
              py: 8,
              px: 3,
              bgcolor: ILT_COLORS.bg,
              borderRadius: 3,
              border: `1px dashed ${ILT_COLORS.border}`,
            }}
          >
            <WeekendIcon sx={{ fontSize: 48, color: ILT_COLORS.icon, mb: 2, opacity: 0.6 }} />
            <Typography sx={{ fontSize: 16, fontWeight: 500, color: "text.secondary", mb: 1 }}>
              Dar nėra ilgalaikio turto
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.disabled" }}>
              Atidarykite pirkimo sąskaitą ir spauskite „Sukurti ilgalaikį turtą“ prie reikiamos eilutės
            </Typography>
          </Box>
        )
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table size="small" sx={{ minWidth: 1000 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Inv. nr.</TableCell>
                <TableCell sx={headCellSx}>Pavadinimas</TableCell>
                <TableCell sx={headCellSx}>Grupė</TableCell>
                <TableCell sx={headCellSx}>Pirkimas</TableCell>
                <TableCell sx={headCellSx}>Įsigijimo data</TableCell>
                <TableCell sx={headCellSx}>Nusidėvėjimas nuo</TableCell>
                <TableCell sx={headCellSx} align="right">Savikaina</TableCell>
                <TableCell sx={headCellSx} align="right">Sukauptas</TableCell>
                <TableCell sx={headCellSx} align="right">Likutinė vertė</TableCell>
                <TableCell sx={headCellSx}>Statusas</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a.id} hover sx={{ cursor: "pointer" }} onClick={() => setDetailId(a.id)}>
                  <TableCell sx={{ fontSize: 13, whiteSpace: "nowrap" }}>{a.inventory_number || "—"}</TableCell>
                  <TableCell sx={{ fontSize: 13, fontWeight: 600, color: "primary.main" }}>{a.name}</TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{a.group_display || "—"}</TableCell>
                  <TableCell sx={{ fontSize: 13, whiteSpace: "nowrap" }}>
                    {a.purchase ? (
                      <Typography
                        component="span"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPurchaseId(a.purchase);
                        }}
                        sx={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "primary.main",
                          cursor: "pointer",
                          "&:hover": { textDecoration: "underline" },
                        }}
                      >
                        {a.purchase_document || `#${a.purchase}`}
                      </Typography>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{fmtDate(a.purchase_date)}</TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{fmtDate(a.depreciation_start)}</TableCell>
                  <TableCell sx={{ fontSize: 13 }} align="right">{fmtEur(a.base_cost)}</TableCell>
                  <TableCell sx={{ fontSize: 13 }} align="right">{fmtEur(a.accumulated)}</TableCell>
                  <TableCell sx={{ fontSize: 13, fontWeight: 600 }} align="right">{fmtEur(a.residual)}</TableCell>
                  <TableCell><AssetStatusChip asset={a} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );

  return (
    <Box sx={{ p: isMobile ? 2 : 4 }}>
      <Helmet>
        <title>Ilgalaikis turtas - DokSkenas</title>
      </Helmet>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
        <Typography variant={isMobile ? "h6" : "h5"}>Ilgalaikis turtas</Typography>
        {activeProfile && (
          <Chip label={activeProfile.name} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setManualOpen(true)}
          sx={{ textTransform: "none", borderRadius: 3, background: "linear-gradient(135deg, #FF9800, #F57C00)" }}
        >
          Naujas turtas
        </Button>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": { textTransform: "none", fontWeight: 600 },
          "& .Mui-selected": { color: "#A0590F !important" },
          "& .MuiTabs-indicator": { bgcolor: "#F57C00" },
        }}
      >
        <Tab value="turtas" label="Turtas" />
        <Tab value="nusidevejimas" label="Nusidėvėjimas" />
      </Tabs>

      {tab === "turtas" && renderAssets()}
      {tab === "nusidevejimas" && (
        <FixedAssetDepreciationPanel
          activeId={activeId}
          onChanged={loadAssets}
          onOpenAsset={setDetailId}
        />
      )}

      <FixedAssetManualDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={async (asset) => {
          setTab("turtas");
          await loadAssets();
          if (asset?.id) setDetailId(asset.id);
        }}
      />

      <FixedAssetDetailDialog
        open={Boolean(detailId)}
        assetId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={loadAssets}
        activeProfileId={activeId}
      />

      <DocumentImageDialog
        open={Boolean(purchaseId)}
        onClose={() => setPurchaseId(null)}
        purchaseId={purchaseId}
      />
    </Box>
  );
}