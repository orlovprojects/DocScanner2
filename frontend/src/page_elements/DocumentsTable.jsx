import { useEffect, useState, useRef } from "react";
import { api } from "../api/endpoints";
import {
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Checkbox,
  CircularProgress,
  Tooltip,
  IconButton,
  Menu,
  MenuItem,
  Box,
  InputBase,
  Chip,
  Typography,
  Card,
  CardContent,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { alpha, styled } from "@mui/material/styles";
import WarningIcon from "@mui/icons-material/Warning";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import FeedIcon from "@mui/icons-material/Feed";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import PercentIcon from "@mui/icons-material/Percent";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CancelIcon from "@mui/icons-material/Cancel";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import SellIcon from "@mui/icons-material/Sell";

// Стилизованный контейнер поиска
const SearchWrapper = styled(Box, {
  shouldForwardProp: (prop) => prop !== "focused",
})(({ theme, focused }) => ({
  display: "inline-flex",
  alignItems: "center",
  backgroundColor: focused
    ? theme.palette.background.paper
    : alpha(theme.palette.action.hover, 0.04),
  borderRadius: 12,
  padding: "8px 14px",
  gap: 10,
  cursor: "text",
  transition: "all 0.01s ease-out",
  border: `1.5px solid ${focused ? theme.palette.primary.main : "transparent"}`,
  boxShadow: focused
    ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`
    : "none",
  width: focused ? 340 : 280,
  "&:hover": {
    backgroundColor: focused
      ? theme.palette.background.paper
      : alpha(theme.palette.action.hover, 0.08),
    borderColor: focused ? theme.palette.primary.main : alpha(theme.palette.divider, 0.3),
  },
  [theme.breakpoints.down('md')]: {
    width: '100%',
  },
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  flex: 1,
  fontSize: 14,
  "& input": {
    padding: 0,
    "&::placeholder": {
      color: theme.palette.text.secondary,
      opacity: 0.7,
    },
  },
}));

const ResultsChip = styled(Chip)(({ theme }) => ({
  height: 22,
  fontSize: 12,
  fontWeight: 500,
  backgroundColor: alpha(theme.palette.primary.main, 0.1),
  color: theme.palette.primary.main,
  "& .MuiChip-label": {
    padding: "0 8px",
  },
}));

// Стилизованная карточка документа для мобильных
const DocumentCard = styled(Card)(({ theme }) => ({
  marginBottom: theme.spacing(1.5),
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  '&:active': {
    backgroundColor: alpha(theme.palette.action.hover, 0.04),
  },
}));

export default function DocumentsTable({
  filtered,
  loading,
  loadingMore = false,
  hasMore = false,
  loadMore,
  onSearchChange,
  selectedRows,
  handleSelectRow,
  handleSelectAll,
  isRowExportable,
  reloadDocuments,
  allowUnknownDirection = false,
  onDeleteDoc,
  showOwnerColumns = false,
  selectAllChecked,
  selectAllIndeterminate,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [anchorEl, setAnchorEl] = useState(null);
  const [menuRowId, setMenuRowId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const inputRef = useRef(null);
  const onSearchChangeRef = useRef(onSearchChange);
  const loadMoreTriggerRef = useRef(null);

  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  useEffect(() => {
    const t = setTimeout(() => {
      onSearchChangeRef.current?.(searchQuery);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // IntersectionObserver для подгрузки ещё документов при прокрутке страницы
  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreTriggerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore?.();
        }
      },
      {
        root: null,
        threshold: 0.1,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadMore]);

  const rows = filtered || [];

  const handleMenuOpen = (event, rowId) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuRowId(rowId);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuRowId(null);
  };
  const handleDeleteRow = async (rowId) => {
    handleMenuClose();
    onDeleteDoc?.(rowId);
    try {
      await api.delete("/documents/bulk-delete/", { data: { ids: [rowId] } });
      reloadDocuments?.();
    } catch (e) {
      alert("Įvyko klaida trinant dokumentą.");
      reloadDocuments?.();
    }
  };

  const clearSearch = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSearchQuery("");
    inputRef.current?.focus();
  };

  const handleWrapperClick = () => {
    inputRef.current?.focus();
  };

  const getDirectionToShow = (d) => {
    const raw =
      typeof d.effective_direction !== "undefined"
        ? d.effective_direction
        : (d.pirkimas_pardavimas || "").toLowerCase();
    if (raw === "") return "";
    const v = (raw || "").toLowerCase();
    if (!v || v === "nezinoma") return "nezinoma";
    if (v === "pirkimas" || v === "pardavimas") return v;
    return "nezinoma";
  };

  const canExport = (d) => {
    if (!isRowExportable(d)) return false;
    if (d.ready_for_export === false || d.math_validation_passed === false) return false;
    if (allowUnknownDirection) return true;
    const dir = getDirectionToShow(d);
    return dir === "pirkimas" || dir === "pardavimas";
  };

  const exportableRows = rows.filter(canExport);
  const exportableIds = exportableRows.map((r) => String(r.id));

  const allExportableSelected =
    exportableIds.length > 0 &&
    exportableIds.every((id) => selectedRows.includes(id));

  const someExportableSelected =
    exportableIds.some((id) => selectedRows.includes(id)) && !allExportableSelected;

  const statusLabel = (d) => {
    if (d.status === "exported") return "Eksportuotas";
    if (d.status === "completed") return "Atliktas";
    if (d.status === "processing" || d.status === "pending") return "Vykdomas";
    if (d.status === "rejected") return "Atmestas";
    if (typeof d.statusLabel === "function") return d.statusLabel(d);
    return d.status || "";
  };

  const statusLabelFull = (d) => {
    if (d.status === "exported") return "Atliktas (Eksportuotas)";
    if (typeof d.statusLabel === "function") return d.statusLabel(d);
    return d.status || "";
  };

  const iconForStatus = (d) => {
    // На десктопе - дефолтный размер (24px), на мобильном - 18px
    const sxProps = isMobile ? { fontSize: 18, verticalAlign: 'middle' } : { verticalAlign: 'middle' };
    
    if (d.status === "exported" || d.status === "completed") {
      return <CheckCircleIcon color="success" sx={sxProps} />;
    }
    if (d.status === "processing" || d.status === "pending") {
      return <HourglassEmptyIcon color="warning" sx={sxProps} />;
    }
    if (d.status === "rejected") {
      return <CancelIcon color="error" sx={sxProps} />;
    }
    if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
    return null;
  };

  const renderScanType = (d) => {
    const t = d?.scan_type;
    if (!t) return "Nežinomas";
    const mapping = { sumiskai: "Sumiškai", detaliai: "Detaliai" };
    if (mapping[t]) return mapping[t];
    const label = String(t).replace(/_/g, " ").toLowerCase();
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const renderDirectionCell = (d) => {
    const dir = getDirectionToShow(d);
    if (dir === "") {
      return <span>&nbsp;</span>;
    }
    if (dir === "nezinoma") {
      return (
        <Tooltip title="Nežinomas tipas. Atnaujinkite pirkėjo ar pardavėjo duomenis.">
          <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
            <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} /> Nežinomas
          </span>
        </Tooltip>
      );
    }
    return dir.charAt(0).toUpperCase() + dir.slice(1);
  };

  const renderDirectionShort = (d) => {
    const dir = getDirectionToShow(d);
    if (dir === "" || dir === "nezinoma") {
      return (
        <Box component="span" sx={{ color: 'text.disabled', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <HelpOutlineIcon sx={{ fontSize: 14 }} />
          <span>—</span>
        </Box>
      );
    }
    if (dir === "pirkimas") {
      return (
        <Box component="span" sx={{ color: 'info.main', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <ShoppingCartIcon sx={{ fontSize: 14 }} />
          <span>Pirk.</span>
        </Box>
      );
    }
    if (dir === "pardavimas") {
      return (
        <Box component="span" sx={{ color: 'success.main', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <SellIcon sx={{ fontSize: 14 }} />
          <span>Pard.</span>
        </Box>
      );
    }
    return dir;
  };

  // Проверка: scan_type === "sumiskai" и separate_vat === true
  const hasSeparateVatWarning = (d) => {
    return d.scan_type === "sumiskai" && d.separate_vat === true;
  };

  const renderWarningIcons = (d) => {
    if (d.status !== "completed" && d.status !== "exported") return null;
    
    const icons = [];
    // На десктопе - стандартный small (20px), на мобильном - 16px
    const iconSx = isMobile 
      ? { fontSize: 16, verticalAlign: 'middle', cursor: 'pointer' }
      : { verticalAlign: 'middle', cursor: 'pointer' };
    const iconFontSize = isMobile ? undefined : "small";
    // На мобильном - показывать tooltip быстрее при касании
    const tooltipProps = isMobile ? { enterTouchDelay: 50, leaveTouchDelay: 1500 } : {};
    
    if (d.ready_for_export === false) {
      icons.push(
        <Tooltip key="missing" title="Dokumente trūksta duomenų" {...tooltipProps}>
          <FeedIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#8136c1" }} />
        </Tooltip>
      );
    }
    if (d.math_validation_passed === false) {
      icons.push(
        <Tooltip key="math" title="Sumos nesutampa" {...tooltipProps}>
          <WarningIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f17e67" }} />
        </Tooltip>
      );
    }
    if (hasSeparateVatWarning(d)) {
      icons.push(
        <Tooltip key="vat" title="Keli skirtingi PVM %" {...tooltipProps}>
          <PercentIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#ff9800" }} />
        </Tooltip>
      );
    }
    if (d.buyer_vat_val === "invalid") {
      icons.push(
        <Tooltip key="buyer-vat" title="Negalioja pirkėjo PVM kodas" {...tooltipProps}>
          <PersonOffIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f44336" }} />
        </Tooltip>
      );
    }
    if (d.seller_vat_val === "invalid") {
      icons.push(
        <Tooltip key="seller-vat" title="Negalioja pardavėjo PVM kodas" {...tooltipProps}>
          <PersonOffIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#f44336" }} />
        </Tooltip>
      );
    }
    if (
      (d.buyer_id && d.seller_id && d.buyer_id === d.seller_id) ||
      (d.buyer_name && d.seller_name && d.buyer_name.trim() === d.seller_name.trim()) ||
      (d.buyer_vat_code && d.seller_vat_code && d.buyer_vat_code === d.seller_vat_code)
    ) {
      icons.push(
        <Tooltip key="same" title="Pirkėjo rekvizitai sutampa su pardavėjo" {...tooltipProps}>
          <FeedIcon fontSize={iconFontSize} sx={{ ...iconSx, color: "#ff9800" }} />
        </Tooltip>
      );
    }
    
    return icons.length > 0 ? (
      <Box sx={{ display: 'inline-flex', gap: 0.25, ml: 0.5 }}>
        {icons}
      </Box>
    ) : null;
  };

  const formatDateShort = (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return date.toLocaleDateString("lt-LT", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const baseColCount = 7;
  const extraOwnerCols = showOwnerColumns ? 2 : 0;

  // Mobile: Card-based layout
  const renderMobileList = () => (
    <Box>
      {/* Select All Row */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          py: 1.5, 
          px: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          borderRadius: '12px 12px 0 0',
        }}
      >
        <Checkbox
          size="small"
          indeterminate={
            typeof selectAllIndeterminate === "boolean"
              ? selectAllIndeterminate
              : someExportableSelected
          }
          checked={
            typeof selectAllChecked === "boolean"
              ? selectAllChecked
              : allExportableSelected
          }
          onChange={() => {
            if (
              (typeof selectAllChecked === "boolean" ? selectAllChecked : allExportableSelected)
            ) {
              handleSelectAll([]);
            } else {
              handleSelectAll(exportableIds);
            }
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          Pasirinkti visus ({exportableIds.length})
        </Typography>
      </Box>

      {/* Document Cards */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
          {searchQuery ? (
            <>
              <Typography variant="body2" gutterBottom>Dokumentų nerasta</Typography>
              <Typography variant="caption">Pabandykite kitą paieškos užklausą</Typography>
            </>
          ) : (
            <Typography variant="body2">Nėra dokumentų</Typography>
          )}
        </Box>
      ) : (
        <>
          {rows.map((d) => {
            const rowDisabled = !canExport(d);
            const isSelected = !rowDisabled && selectedRows.includes(String(d.id));

            return (
              <DocumentCard 
                key={String(d.id)}
                sx={{
                  borderColor: isSelected ? 'primary.main' : alpha(theme.palette.divider, 0.5),
                  bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.04) : 'background.paper',
                }}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  {/* Row 1: Checkbox + Filename + Menu */}
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={handleSelectRow(String(d.id))}
                      disabled={rowDisabled}
                      sx={{ p: 0.5, mr: 1 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        flex: 1,
                        fontWeight: 500,
                        color: 'primary.main',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.85rem',
                      }}
                      onClick={() => d.onClickPreview?.(d)}
                    >
                      {d.original_filename}
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={(e) => handleMenuOpen(e, d.id)}
                      sx={{ ml: 0.5, p: 0.5 }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Row 2: Scan type + Direction */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, pl: 4 }}>
                    <Typography variant="caption" color="text.secondary">
                      {renderScanType(d)}
                    </Typography>
                    <Typography variant="caption" component="span">
                      {renderDirectionShort(d)}
                    </Typography>
                  </Box>

                  {/* Row 3: Status + Icons + Date */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {iconForStatus(d)}
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {statusLabel(d)}
                      </Typography>
                      {renderWarningIcons(d)}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateShort(d.uploaded_at)}
                    </Typography>
                  </Box>
                </CardContent>
              </DocumentCard>
            );
          })}

          {/* Load more trigger */}
          {hasMore && (
            <>
              {loadingMore && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
              <Box ref={loadMoreTriggerRef} sx={{ height: 8 }} />
            </>
          )}
        </>
      )}

      {/* Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleDeleteRow(menuRowId)}>Ištrinti</MenuItem>
      </Menu>
    </Box>
  );

  // Desktop: Table layout
  const renderDesktopTable = () => (
    <TableContainer component={Paper}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                indeterminate={
                  typeof selectAllIndeterminate === "boolean"
                    ? selectAllIndeterminate
                    : someExportableSelected
                }
                checked={
                  typeof selectAllChecked === "boolean"
                    ? selectAllChecked
                    : allExportableSelected
                }
                onChange={() => {
                  if (
                    (typeof selectAllChecked === "boolean" ? selectAllChecked : allExportableSelected)
                  ) {
                    handleSelectAll([]);
                  } else {
                    handleSelectAll(exportableIds);
                  }
                }}
                inputProps={{ "aria-label": "select all exportable" }}
              />
            </TableCell>

            {showOwnerColumns && (
              <>
                <TableCell sx={{ fontWeight: 600 }}>User ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
              </>
            )}

            <TableCell sx={{ fontWeight: 600 }}>Failas</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Skaitmenizavimo tipas</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Pirkimas / pardavimas</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Statusas</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
            <TableCell align="right"></TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={baseColCount + extraOwnerCols} align="center">
                <CircularProgress size={24} />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={baseColCount + extraOwnerCols}
                align="center"
                sx={{ py: 4, color: "text.secondary" }}
              >
                {searchQuery ? (
                  <Box>
                    <Box sx={{ fontSize: 14, mb: 0.5 }}>Dokumentų nerasta</Box>
                    <Box sx={{ fontSize: 12, opacity: 0.7 }}>
                      Pabandykite kitą paieškos užklausą
                    </Box>
                  </Box>
                ) : (
                  "Nėra dokumentų"
                )}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {rows.map((d) => {
                const rowDisabled = !canExport(d);

                const shouldShowTooltip =
                  rowDisabled && (d.status === "completed" || d.status === "exported");

                const tooltipTitle = shouldShowTooltip
                  ? "Ištaisykite klaidas prieš eksportuojant"
                  : "";

                return (
                  <TableRow key={String(d.id)} hover>
                    <TableCell padding="checkbox">
                      <Tooltip title={tooltipTitle}>
                        <span>
                          <Checkbox
                            checked={!rowDisabled && selectedRows.includes(String(d.id))}
                            onChange={handleSelectRow(String(d.id))}
                            disabled={rowDisabled}
                            inputProps={{ "aria-label": "select row" }}
                          />
                        </span>
                      </Tooltip>
                    </TableCell>

                    {showOwnerColumns && (
                      <>
                        <TableCell>{d.user_id ?? "—"}</TableCell>
                        <TableCell>{d.owner_email || "—"}</TableCell>
                      </>
                    )}

                    <TableCell
                      sx={{ cursor: "pointer", color: "primary.main" }}
                      onClick={() => d.onClickPreview?.(d)}
                    >
                      {d.original_filename}
                    </TableCell>

                    <TableCell>
                      {(() => {
                        const t = d?.scan_type;
                        if (!t) {
                          return (
                            <Tooltip title="Nežinomas skaitmenizavimo tipas">
                              <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
                                <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} /> Nežinomas
                              </span>
                            </Tooltip>
                          );
                        }
                        const mapping = { sumiskai: "Sumiškai" };
                        if (mapping[t]) return mapping[t];
                        const label = String(t).replace(/_/g, " ").toLowerCase();
                        return label.charAt(0).toUpperCase() + label.slice(1);
                      })()}
                    </TableCell>
                    <TableCell>{renderDirectionCell(d)}</TableCell>

                    <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
                      <Box display="flex" alignItems="center">
                        {iconForStatus(d)}&nbsp;{statusLabelFull(d)}
                        {renderWarningIcons(d)}
                      </Box>
                    </TableCell>

                    <TableCell>{d.fmt?.(d.uploaded_at) || ""}</TableCell>

                    <TableCell align="right">
                      <IconButton onClick={(e) => handleMenuOpen(e, d.id)}>
                        <MoreVertIcon />
                      </IconButton>
                      <Menu
                        anchorEl={anchorEl}
                        open={Boolean(anchorEl) && menuRowId === d.id}
                        onClose={handleMenuClose}
                      >
                        <MenuItem onClick={() => handleDeleteRow(d.id)}> Ištrinti </MenuItem>
                      </Menu>
                    </TableCell>
                  </TableRow>
                );
              })}

              {hasMore && (
                <>
                  {loadingMore && (
                    <TableRow>
                      <TableCell
                        colSpan={baseColCount + extraOwnerCols}
                        align="center"
                      >
                        <CircularProgress size={20} />
                      </TableCell>
                    </TableRow>
                  )}

                  <TableRow>
                    <TableCell
                      colSpan={baseColCount + extraOwnerCols}
                      align="center"
                    >
                      <Box
                        ref={loadMoreTriggerRef}
                        sx={{ height: 8 }}
                      />
                    </TableCell>
                  </TableRow>
                </>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Box>
      {/* Search field */}
      <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: 'wrap' }}>
        <SearchWrapper focused={searchFocused} onClick={handleWrapperClick}>
          <SearchIcon
            sx={{
              color: searchFocused ? "primary.main" : "text.secondary",
              fontSize: 20,
              transition: "color 0.01s ease-out",
              cursor: "text",
            }}
          />
          <StyledInputBase
            inputRef={inputRef}
            placeholder="Ieškoti pagal dok. numerį..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery && (
            <IconButton
              size="small"
              onMouseDown={clearSearch}
              sx={{
                p: 0.25,
                color: "text.secondary",
                "&:hover": {
                  color: "text.primary",
                  backgroundColor: "action.hover",
                },
              }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </SearchWrapper>

        {searchQuery && (
          <ResultsChip
            label={`${rows.length}`}
            size="small"
          />
        )}
      </Box>

      {/* Conditional rendering based on screen size */}
      {isMobile ? renderMobileList() : renderDesktopTable()}
    </Box>
  );
}



// import { useEffect, useState, useRef } from "react";
// import { api } from "../api/endpoints";
// import {
//   TableContainer,
//   Table,
//   TableHead,
//   TableRow,
//   TableCell,
//   TableBody,
//   Paper,
//   Checkbox,
//   CircularProgress,
//   Tooltip,
//   IconButton,
//   Menu,
//   MenuItem,
//   Box,
//   InputBase,
//   Chip,
// } from "@mui/material";
// import { alpha, styled } from "@mui/material/styles";
// import WarningIcon from "@mui/icons-material/Warning";
// import PersonOffIcon from "@mui/icons-material/PersonOff";
// import FeedIcon from "@mui/icons-material/Feed";
// import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
// import CheckCircleIcon from "@mui/icons-material/CheckCircle";
// import MoreVertIcon from "@mui/icons-material/MoreVert";
// import SearchIcon from "@mui/icons-material/Search";
// import CloseIcon from "@mui/icons-material/Close";
// import PercentIcon from "@mui/icons-material/Percent";

// // Стилизованный контейнер поиска
// const SearchWrapper = styled(Box, {
//   shouldForwardProp: (prop) => prop !== "focused",
// })(({ theme, focused }) => ({
//   display: "inline-flex",
//   alignItems: "center",
//   backgroundColor: focused
//     ? theme.palette.background.paper
//     : alpha(theme.palette.action.hover, 0.04),
//   borderRadius: 12,
//   padding: "8px 14px",
//   gap: 10,
//   cursor: "text",
//   transition: "all 0.01s ease-out",
//   border: `1.5px solid ${focused ? theme.palette.primary.main : "transparent"}`,
//   boxShadow: focused
//     ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`
//     : "none",
//   width: focused ? 340 : 280,
//   "&:hover": {
//     backgroundColor: focused
//       ? theme.palette.background.paper
//       : alpha(theme.palette.action.hover, 0.08),
//     borderColor: focused ? theme.palette.primary.main : alpha(theme.palette.divider, 0.3),
//   },
// }));

// const StyledInputBase = styled(InputBase)(({ theme }) => ({
//   flex: 1,
//   fontSize: 14,
//   "& input": {
//     padding: 0,
//     "&::placeholder": {
//       color: theme.palette.text.secondary,
//       opacity: 0.7,
//     },
//   },
// }));

// const ResultsChip = styled(Chip)(({ theme }) => ({
//   height: 22,
//   fontSize: 12,
//   fontWeight: 500,
//   backgroundColor: alpha(theme.palette.primary.main, 0.1),
//   color: theme.palette.primary.main,
//   "& .MuiChip-label": {
//     padding: "0 8px",
//   },
// }));

// export default function DocumentsTable({
//   filtered,
//   loading,
//   loadingMore = false,
//   hasMore = false,
//   loadMore,
//   onSearchChange,
//   selectedRows,
//   handleSelectRow,
//   handleSelectAll,
//   isRowExportable,
//   reloadDocuments,
//   allowUnknownDirection = false,
//   onDeleteDoc,
//   showOwnerColumns = false,
//   selectAllChecked,
//   selectAllIndeterminate,
// }) {
//   const [anchorEl, setAnchorEl] = useState(null);
//   const [menuRowId, setMenuRowId] = useState(null);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [searchFocused, setSearchFocused] = useState(false);

//   const inputRef = useRef(null);
//   const onSearchChangeRef = useRef(onSearchChange);
//   const loadMoreTriggerRef = useRef(null);

//   useEffect(() => {
//     onSearchChangeRef.current = onSearchChange;
//   }, [onSearchChange]);

//   useEffect(() => {
//     const t = setTimeout(() => {
//       onSearchChangeRef.current?.(searchQuery);
//     }, 300);
//     return () => clearTimeout(t);
//   }, [searchQuery]);

//   // IntersectionObserver для подгрузки ещё документов при прокрутке страницы
//   useEffect(() => {
//     if (!hasMore) return;
//     const el = loadMoreTriggerRef.current;
//     if (!el) return;

//     const observer = new IntersectionObserver(
//       (entries) => {
//         const entry = entries[0];
//         if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
//           loadMore?.();
//         }
//       },
//       {
//         root: null,      // окно браузера
//         threshold: 0.1,  // достаточно, чтобы 10% было видно
//       }
//     );

//     observer.observe(el);
//     return () => observer.disconnect();
//   }, [hasMore, loadingMore, loading, loadMore]);

//   const rows = filtered || [];

//   const handleMenuOpen = (event, rowId) => {
//     setAnchorEl(event.currentTarget);
//     setMenuRowId(rowId);
//   };
//   const handleMenuClose = () => {
//     setAnchorEl(null);
//     setMenuRowId(null);
//   };
//   const handleDeleteRow = async (rowId) => {
//     handleMenuClose();
//     onDeleteDoc?.(rowId);
//     try {
//       await api.delete("/documents/bulk-delete/", { data: { ids: [rowId] } });
//       reloadDocuments?.();
//     } catch (e) {
//       alert("Įvyko klaida trinant dokumentą.");
//       reloadDocuments?.();
//     }
//   };

//   const clearSearch = (e) => {
//     e.preventDefault();
//     e.stopPropagation();
//     setSearchQuery("");
//     inputRef.current?.focus();
//   };

//   const handleWrapperClick = () => {
//     inputRef.current?.focus();
//   };

//   const getDirectionToShow = (d) => {
//     const raw =
//       typeof d.effective_direction !== "undefined"
//         ? d.effective_direction
//         : (d.pirkimas_pardavimas || "").toLowerCase();
//     if (raw === "") return "";
//     const v = (raw || "").toLowerCase();
//     if (!v || v === "nezinoma") return "nezinoma";
//     if (v === "pirkimas" || v === "pardavimas") return v;
//     return "nezinoma";
//   };

//   const canExport = (d) => {
//     if (!isRowExportable(d)) return false;
//     if (d.ready_for_export === false || d.math_validation_passed === false) return false;
//     if (allowUnknownDirection) return true;
//     const dir = getDirectionToShow(d);
//     return dir === "pirkimas" || dir === "pardavimas";
//   };

//   const exportableRows = rows.filter(canExport);
//   const exportableIds = exportableRows.map((r) => String(r.id));

//   const allExportableSelected =
//     exportableIds.length > 0 &&
//     exportableIds.every((id) => selectedRows.includes(id));

//   const someExportableSelected =
//     exportableIds.some((id) => selectedRows.includes(id)) && !allExportableSelected;

//   const statusLabel = (d) => {
//     if (d.status === "exported") return "Atliktas (Eksportuotas)";
//     if (typeof d.statusLabel === "function") return d.statusLabel(d);
//     return d.status || "";
//   };

//   const iconForStatus = (d) => {
//     if (d.status === "exported") {
//       return <CheckCircleIcon color="success" sx={{ verticalAlign: "middle" }} />;
//     }
//     if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
//     return null;
//   };

//   const renderScanType = (d) => {
//     const t = d?.scan_type;
//     if (!t) {
//       return (
//         <Tooltip title="Nežinomas skaitmenizavimo tipas">
//           <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
//             <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} /> Nežinomas
//           </span>
//         </Tooltip>
//       );
//     }
//     const mapping = { sumiskai: "Sumiškai" };
//     if (mapping[t]) return mapping[t];
//     const label = String(t).replace(/_/g, " ").toLowerCase();
//     return label.charAt(0).toUpperCase() + label.slice(1);
//   };

//   const renderDirectionCell = (d) => {
//     const dir = getDirectionToShow(d);
//     if (dir === "") {
//       return <span>&nbsp;</span>;
//     }
//     if (dir === "nezinoma") {
//       return (
//         <Tooltip title="Nežinomas tipas. Atnaujinkite pirkėjo ar pardavėjo duomenis.">
//           <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
//             <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} /> Nežinomas
//           </span>
//         </Tooltip>
//       );
//     }
//     return dir.charAt(0).toUpperCase() + dir.slice(1);
//   };

//   // Проверка: scan_type === "sumiskai" и separate_vat === true
//   const hasSeparateVatWarning = (d) => {
//     return d.scan_type === "sumiskai" && d.separate_vat === true;
//   };

//   const baseColCount = 7;
//   const extraOwnerCols = showOwnerColumns ? 2 : 0;

//   return (
//     <Box>
//       {/* Современное поле поиска */}
//       <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
//         <SearchWrapper focused={searchFocused} onClick={handleWrapperClick}>
//           <SearchIcon
//             sx={{
//               color: searchFocused ? "primary.main" : "text.secondary",
//               fontSize: 20,
//               transition: "color 0.01s ease-out",
//               cursor: "text",
//             }}
//           />
//           <StyledInputBase
//             inputRef={inputRef}
//             placeholder="Ieškoti pagal dok. numerį..."
//             value={searchQuery}
//             onChange={(e) => setSearchQuery(e.target.value)}
//             onFocus={() => setSearchFocused(true)}
//             onBlur={() => setSearchFocused(false)}
//           />
//           {searchQuery && (
//             <IconButton
//               size="small"
//               onMouseDown={clearSearch}
//               sx={{
//                 p: 0.25,
//                 color: "text.secondary",
//                 "&:hover": {
//                   color: "text.primary",
//                   backgroundColor: "action.hover",
//                 },
//               }}
//             >
//               <CloseIcon sx={{ fontSize: 18 }} />
//             </IconButton>
//           )}
//         </SearchWrapper>

//         {searchQuery && (
//           <ResultsChip
//             label={`${rows.length}`}
//             size="small"
//           />
//         )}
//       </Box>

//       <TableContainer component={Paper}>
//         <Table stickyHeader size="small">
//           <TableHead>
//             <TableRow>
//               <TableCell padding="checkbox">
//                 <Checkbox
//                   indeterminate={
//                     typeof selectAllIndeterminate === "boolean"
//                       ? selectAllIndeterminate
//                       : someExportableSelected
//                   }
//                   checked={
//                     typeof selectAllChecked === "boolean"
//                       ? selectAllChecked
//                       : allExportableSelected
//                   }
//                   onChange={() => {
//                     // если нам сверху явно сказали "checked" (filtered mode),
//                     // то повторный клик должен триггерить handleSelectAll([]) на стороне родителя
//                     if (
//                       (typeof selectAllChecked === "boolean" ? selectAllChecked : allExportableSelected)
//                     ) {
//                       handleSelectAll([]);
//                     } else {
//                       handleSelectAll(exportableIds);
//                     }
//                   }}
//                   inputProps={{ "aria-label": "select all exportable" }}
//                 />
//               </TableCell>

//               {showOwnerColumns && (
//                 <>
//                   <TableCell sx={{ fontWeight: 600 }}>User ID</TableCell>
//                   <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
//                 </>
//               )}

//               <TableCell sx={{ fontWeight: 600 }}>Failas</TableCell>
//               <TableCell sx={{ fontWeight: 600 }}>Skaitmenizavimo tipas</TableCell>
//               <TableCell sx={{ fontWeight: 600 }}>Pirkimas / pardavimas</TableCell>
//               <TableCell sx={{ fontWeight: 600 }}>Statusas</TableCell>
//               <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
//               <TableCell align="right"></TableCell>
//             </TableRow>
//           </TableHead>

//           <TableBody>
//             {loading ? (
//               <TableRow>
//                 <TableCell colSpan={baseColCount + extraOwnerCols} align="center">
//                   <CircularProgress size={24} />
//                 </TableCell>
//               </TableRow>
//             ) : rows.length === 0 ? (
//               <TableRow>
//                 <TableCell
//                   colSpan={baseColCount + extraOwnerCols}
//                   align="center"
//                   sx={{ py: 4, color: "text.secondary" }}
//                 >
//                   {searchQuery ? (
//                     <Box>
//                       <Box sx={{ fontSize: 14, mb: 0.5 }}>Dokumentų nerasta</Box>
//                       <Box sx={{ fontSize: 12, opacity: 0.7 }}>
//                         Pabandykite kitą paieškos užklausą
//                       </Box>
//                     </Box>
//                   ) : (
//                     "Nėra dokumentų"
//                   )}
//                 </TableCell>
//               </TableRow>
//             ) : (
//               <>
//                 {rows.map((d) => {
//                   const rowDisabled = !canExport(d);

//                   const shouldShowTooltip =
//                     rowDisabled && (d.status === "completed" || d.status === "exported");

//                   const tooltipTitle = shouldShowTooltip
//                     ? "Ištaisykite klaidas prieš eksportuojant"
//                     : "";

//                   return (
//                     <TableRow key={String(d.id)} hover>
//                       <TableCell padding="checkbox">
//                         <Tooltip title={tooltipTitle}>
//                           <span>
//                             <Checkbox
//                               checked={!rowDisabled && selectedRows.includes(String(d.id))}
//                               onChange={handleSelectRow(String(d.id))}
//                               disabled={rowDisabled}
//                               inputProps={{ "aria-label": "select row" }}
//                             />
//                           </span>
//                         </Tooltip>
//                       </TableCell>

//                       {showOwnerColumns && (
//                         <>
//                           <TableCell>{d.user_id ?? "—"}</TableCell>
//                           <TableCell>{d.owner_email || "—"}</TableCell>
//                         </>
//                       )}

//                       <TableCell
//                         sx={{ cursor: "pointer", color: "primary.main" }}
//                         onClick={() => d.onClickPreview?.(d)}
//                       >
//                         {d.original_filename}
//                       </TableCell>

//                       <TableCell>{renderScanType(d)}</TableCell>
//                       <TableCell>{renderDirectionCell(d)}</TableCell>

//                       <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
//                         <Box display="flex" alignItems="center">
//                           {iconForStatus(d)}&nbsp;{statusLabel(d)}

//                           {(d.status === "completed" || d.status === "exported") && (
//                             <>
//                               {d.ready_for_export === false && (
//                                 <Tooltip title="Dokumente trūksta duomenų">
//                                   <FeedIcon
//                                     fontSize="small"
//                                     sx={{
//                                       ml: 0.25,
//                                       verticalAlign: "middle",
//                                       cursor: "pointer",
//                                       color: "#8136c1",
//                                     }}
//                                   />
//                                 </Tooltip>
//                               )}
//                               {d.math_validation_passed === false && (
//                                 <Tooltip title="Sumos nesutampa">
//                                   <WarningIcon
//                                     fontSize="small"
//                                     sx={{
//                                       ml: 0.25,
//                                       verticalAlign: "middle",
//                                       cursor: "pointer",
//                                       color: "#f17e67",
//                                     }}
//                                   />
//                                 </Tooltip>
//                               )}
//                               {hasSeparateVatWarning(d) && (
//                                 <Tooltip title="Keli skirtingi PVM %. Skaitmenizuojant tokias sąskaitas sumiškai nenusistato PVM procentai bei PVM klasifikatoriai.">
//                                   <PercentIcon
//                                     fontSize="small"
//                                     sx={{
//                                       ml: 0.25,
//                                       verticalAlign: "middle",
//                                       cursor: "pointer",
//                                       color: "#ff9800",
//                                     }}
//                                   />
//                                 </Tooltip>
//                               )}
//                               {d.buyer_vat_val === "invalid" && (
//                                 <Tooltip title="Negalioja pirkėjo PVM kodas">
//                                   <PersonOffIcon
//                                     fontSize="small"
//                                     sx={{
//                                       ml: 0.25,
//                                       verticalAlign: "middle",
//                                       cursor: "pointer",
//                                       color: "#f44336",
//                                     }}
//                                   />
//                                 </Tooltip>
//                               )}
//                               {d.seller_vat_val === "invalid" && (
//                                 <Tooltip title="Negalioja pardavėjo PVM kodas">
//                                   <PersonOffIcon
//                                     fontSize="small"
//                                     sx={{
//                                       ml: 0.25,
//                                       verticalAlign: "middle",
//                                       cursor: "pointer",
//                                       color: "#f44336",
//                                     }}
//                                   />
//                                 </Tooltip>
//                               )}
//                               {(
//                                 (d.buyer_id && d.seller_id && d.buyer_id === d.seller_id) ||
//                                 (d.buyer_name && d.seller_name && d.buyer_name.trim() === d.seller_name.trim()) ||
//                                 (d.buyer_vat_code && d.seller_vat_code && d.buyer_vat_code === d.seller_vat_code)
//                               ) && (
//                                 <Tooltip title="Pirkėjo rekvizitai sutampa su pardavėjo rekvizitais">
//                                   <FeedIcon
//                                     fontSize="small"
//                                     sx={{
//                                       ml: 0.25,
//                                       verticalAlign: "middle",
//                                       cursor: "pointer",
//                                       color: "#ff9800",
//                                     }}
//                                   />
//                                 </Tooltip>
//                               )}
//                             </>
//                           )}
//                         </Box>
//                       </TableCell>

//                       <TableCell>{d.fmt?.(d.uploaded_at) || ""}</TableCell>

//                       <TableCell align="right">
//                         <IconButton onClick={(e) => handleMenuOpen(e, d.id)}>
//                           <MoreVertIcon />
//                         </IconButton>
//                         <Menu
//                           anchorEl={anchorEl}
//                           open={Boolean(anchorEl) && menuRowId === d.id}
//                           onClose={handleMenuClose}
//                         >
//                           <MenuItem onClick={() => handleDeleteRow(d.id)}> Ištrinti </MenuItem>
//                         </Menu>
//                       </TableCell>
//                     </TableRow>
//                   );
//                 })}

//                 {hasMore && (
//                   <>
//                     {/* Видимый лоадер для пользователя */}
//                     {loadingMore && (
//                       <TableRow>
//                         <TableCell
//                           colSpan={baseColCount + extraOwnerCols}
//                           align="center"
//                         >
//                           <CircularProgress size={20} />
//                         </TableCell>
//                       </TableRow>
//                     )}

//                     {/* Невидимый триггер для IntersectionObserver */}
//                     <TableRow>
//                       <TableCell
//                         colSpan={baseColCount + extraOwnerCols}
//                         align="center"
//                       >
//                         <Box
//                           ref={loadMoreTriggerRef}
//                           sx={{ height: 8 }}
//                         />
//                       </TableCell>
//                     </TableRow>
//                   </>
//                 )}

//               </>
//             )}
//           </TableBody>
//         </Table>
//       </TableContainer>
//     </Box>
//   );
// }
