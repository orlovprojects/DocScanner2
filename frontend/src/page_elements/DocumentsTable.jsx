import { useState, useRef } from "react";
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
} from "@mui/material";
import { alpha, styled } from "@mui/material/styles";
import WarningIcon from "@mui/icons-material/Warning";
import PersonOffIcon from '@mui/icons-material/PersonOff';
import FeedIcon from "@mui/icons-material/Feed";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";

// Стилизованный контейнер поиска
const SearchWrapper = styled(Box)(({ theme, focused }) => ({
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

export default function DocumentsTable({
  filtered,
  loading,
  selectedRows,
  handleSelectRow,
  handleSelectAll,
  isRowExportable,
  reloadDocuments,
  allowUnknownDirection = false,
  onDeleteDoc,
  showOwnerColumns = false,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuRowId, setMenuRowId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef(null);

  const allRows = filtered || [];

  // Фильтрация по document_number
  const rows = allRows.filter((d) => {
    if (!searchQuery.trim()) return true;
    const docNum = (d.document_number || "").toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    return docNum.includes(query);
  });

  const handleMenuOpen = (event, rowId) => {
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
  const exportableIds = exportableRows.map((r) => r.id);

  const allExportableSelected =
    exportableIds.length > 0 &&
    exportableIds.every((id) => selectedRows.includes(id));

  const someExportableSelected =
    exportableIds.some((id) => selectedRows.includes(id)) && !allExportableSelected;

  const statusLabel = (d) => {
    if (d.status === "exported") return "Atliktas (Eksportuotas)";
    if (typeof d.statusLabel === "function") return d.statusLabel(d);
    return d.status || "";
  };

  const iconForStatus = (d) => {
    if (d.status === "exported") {
      return <CheckCircleIcon color="success" sx={{ verticalAlign: "middle" }} />;
    }
    if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
    return null;
  };

  const renderScanType = (d) => {
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

  const baseColCount = 7;
  const extraOwnerCols = showOwnerColumns ? 2 : 0;

  return (
    <Box>
      {/* Современное поле поиска */}
      <Box sx={{ mb: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
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
            label={`${rows.length} iš ${allRows.length}`}
            size="small"
          />
        )}
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={someExportableSelected}
                  checked={allExportableSelected}
                  onChange={() => {
                    if (allExportableSelected) {
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
              rows.map((d) => {
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
                            checked={!rowDisabled && selectedRows.includes(d.id)}
                            onChange={handleSelectRow(d.id)}
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

                    <TableCell>{renderScanType(d)}</TableCell>
                    <TableCell>{renderDirectionCell(d)}</TableCell>

                    {/* <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
                      <Box display="flex" alignItems="center">
                        {iconForStatus(d)}&nbsp;{statusLabel(d)}

                        {(d.status === "completed" || d.status === "exported") && (
                          <>
                            {d.ready_for_export === false && (
                              <Tooltip title="Dokumente trūksta duomenų">
                                <FeedIcon
                                  fontSize="small"
                                  sx={{
                                    ml: 0.25,
                                    verticalAlign: "middle",
                                    cursor: "pointer",
                                    color: "#8136c1",
                                  }}
                                />
                              </Tooltip>
                            )}
                            {d.math_validation_passed === false && (
                              <Tooltip title="Sumos nesutampa">
                                <WarningIcon
                                  fontSize="small"
                                  sx={{
                                    ml: 0.25,
                                    verticalAlign: "middle",
                                    cursor: "pointer",
                                    color: "#f17e67",
                                  }}
                                />
                              </Tooltip>
                            )}
                          </>
                        )}
                      </Box>
                    </TableCell> */}

                    <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
                      <Box display="flex" alignItems="center">
                        {iconForStatus(d)}&nbsp;{statusLabel(d)}

                        {(d.status === "completed" || d.status === "exported") && (
                          <>
                            {d.ready_for_export === false && (
                              <Tooltip title="Dokumente trūksta duomenų">
                                <FeedIcon
                                  fontSize="small"
                                  sx={{
                                    ml: 0.25,
                                    verticalAlign: "middle",
                                    cursor: "pointer",
                                    color: "#8136c1",
                                  }}
                                />
                              </Tooltip>
                            )}
                            {d.math_validation_passed === false && (
                              <Tooltip title="Sumos nesutampa">
                                <WarningIcon
                                  fontSize="small"
                                  sx={{
                                    ml: 0.25,
                                    verticalAlign: "middle",
                                    cursor: "pointer",
                                    color: "#f17e67",
                                  }}
                                />
                              </Tooltip>
                            )}
                            {d.buyer_vat_val === 'invalid' && (
                              <Tooltip title="Negalioja pirkėjo PVM kodas">
                                <PersonOffIcon
                                  fontSize="small"
                                  sx={{
                                    ml: 0.25,
                                    verticalAlign: "middle",
                                    cursor: "pointer",
                                    color: "#f44336",
                                  }}
                                />
                              </Tooltip>
                            )}
                            {d.seller_vat_val === 'invalid' && (
                              <Tooltip title="Negalioja pardavėjo PVM kodas">
                                <PersonOffIcon
                                  fontSize="small"
                                  sx={{
                                    ml: 0.25,
                                    verticalAlign: "middle",
                                    cursor: "pointer",
                                    color: "#f44336",
                                  }}
                                />
                              </Tooltip>
                            )}
                          </>
                        )}
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
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}



// import { useState } from "react";
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
// } from "@mui/material";
// import WarningIcon from "@mui/icons-material/Warning";
// import FeedIcon from "@mui/icons-material/Feed";
// import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
// import CheckCircleIcon from "@mui/icons-material/CheckCircle";
// import MoreVertIcon from "@mui/icons-material/MoreVert";

// export default function DocumentsTable({
//   filtered,
//   loading,
//   selectedRows,
//   handleSelectRow,
//   handleSelectAll, // ТЕПЕРЬ ожидаем, что сюда придёт массив id
//   isRowExportable,
//   reloadDocuments,
//   allowUnknownDirection = false,
//   onDeleteDoc,
//   showOwnerColumns = false,
// }) {
//   const [anchorEl, setAnchorEl] = useState(null);
//   const [menuRowId, setMenuRowId] = useState(null);
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

//   // ↓↓↓ ЭТОТ БЛОК — НОВАЯ ЛОГИКА ДЛЯ select-all ↓↓↓
//   const exportableRows = rows.filter(canExport);
//   const exportableIds = exportableRows.map((r) => r.id);

//   const allExportableSelected =
//     exportableIds.length > 0 &&
//     exportableIds.every((id) => selectedRows.includes(id));

//   const someExportableSelected =
//     exportableIds.some((id) => selectedRows.includes(id)) && !allExportableSelected;
//   // ↑↑↑ КОНЕЦ НОВОГО БЛОКА ↑↑↑

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

//   const baseColCount = 7;
//   const extraOwnerCols = showOwnerColumns ? 2 : 0;

//   return (
//     <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
//       <Table stickyHeader size="small">
//         <TableHead>
//           <TableRow>
//             <TableCell padding="checkbox">
//               {/* ЧЕКБОКС В ХЕДЕРЕ — ИЗМЕНЁН */}
//               <Checkbox
//                 indeterminate={someExportableSelected}
//                 checked={allExportableSelected}
//                 onChange={() => {
//                   if (allExportableSelected) {
//                     // снять выбор со всех экспортируемых
//                     handleSelectAll([]);
//                   } else {
//                     // выбрать только экспортируемые
//                     handleSelectAll(exportableIds);
//                   }
//                 }}
//                 inputProps={{ "aria-label": "select all exportable" }}
//               />
//             </TableCell>

//             {showOwnerColumns && (
//               <>
//                 <TableCell sx={{ fontWeight: 600 }}>User ID</TableCell>
//                 <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
//               </>
//             )}

//             <TableCell sx={{ fontWeight: 600 }}>Failas</TableCell>
//             <TableCell sx={{ fontWeight: 600 }}>Skaitmenizavimo tipas</TableCell>
//             <TableCell sx={{ fontWeight: 600 }}>Pirkimas / pardavimas</TableCell>
//             <TableCell sx={{ fontWeight: 600 }}>Statusas</TableCell>
//             <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
//             <TableCell align="right"></TableCell>
//           </TableRow>
//         </TableHead>

//         <TableBody>
//           {loading ? (
//             <TableRow>
//               <TableCell colSpan={baseColCount + extraOwnerCols} align="center">
//                 <CircularProgress size={24} />
//               </TableCell>
//             </TableRow>
//           ) : (
//             rows.map((d) => {
//               const rowDisabled = !canExport(d);

//               const shouldShowTooltip =
//                 rowDisabled && (d.status === "completed" || d.status === "exported");

//               const tooltipTitle = shouldShowTooltip
//                 ? "Ištaisykite klaidas prieš eksportuojant"
//                 : "";

//               return (
//                 <TableRow key={String(d.id)} hover>
//                   <TableCell padding="checkbox">
//                     <Tooltip title={tooltipTitle}>
//                       <span>
//                         {/* ЗДЕСЬ ТОЖЕ ИЗМЕНЕНИЕ: disabled строки НЕ показываются как checked */}
//                         <Checkbox
//                           checked={!rowDisabled && selectedRows.includes(d.id)}
//                           onChange={handleSelectRow(d.id)}
//                           disabled={rowDisabled}
//                           inputProps={{ "aria-label": "select row" }}
//                         />
//                       </span>
//                     </Tooltip>
//                   </TableCell>

//                   {showOwnerColumns && (
//                     <>
//                       <TableCell>{d.user_id ?? "—"}</TableCell>
//                       <TableCell>{d.owner_email || "—"}</TableCell>
//                     </>
//                   )}

//                   <TableCell
//                     sx={{ cursor: "pointer", color: "primary.main" }}
//                     onClick={() => d.onClickPreview?.(d)}
//                   >
//                     {d.original_filename}
//                   </TableCell>

//                   <TableCell>{renderScanType(d)}</TableCell>
//                   <TableCell>{renderDirectionCell(d)}</TableCell>

//                   <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
//                     <Box display="flex" alignItems="center">
//                       {iconForStatus(d)}&nbsp;{statusLabel(d)}

//                       {(d.status === "completed" || d.status === "exported") && (
//                         <>
//                           {d.ready_for_export === false && (
//                             <Tooltip title="Dokumente trūksta duomenų">
//                               <FeedIcon
//                                 fontSize="small"
//                                 sx={{
//                                   ml: 0.25,
//                                   verticalAlign: "middle",
//                                   cursor: "pointer",
//                                   color: "#8136c1",
//                                 }}
//                               />
//                             </Tooltip>
//                           )}
//                           {d.math_validation_passed === false && (
//                             <Tooltip title="Sumos nesutampa">
//                               <WarningIcon
//                                 fontSize="small"
//                                 sx={{
//                                   ml: 0.25,
//                                   verticalAlign: "middle",
//                                   cursor: "pointer",
//                                   color: "#f17e67",
//                                 }}
//                               />
//                             </Tooltip>
//                           )}
//                         </>
//                       )}
//                     </Box>
//                   </TableCell>

//                   <TableCell>{d.fmt?.(d.uploaded_at) || ""}</TableCell>

//                   <TableCell align="right">
//                     <IconButton onClick={(e) => handleMenuOpen(e, d.id)}>
//                       <MoreVertIcon />
//                     </IconButton>
//                     <Menu
//                       anchorEl={anchorEl}
//                       open={Boolean(anchorEl) && menuRowId === d.id}
//                       onClose={handleMenuClose}
//                     >
//                       <MenuItem onClick={() => handleDeleteRow(d.id)}> Ištrinti </MenuItem>
//                     </Menu>
//                   </TableCell>
//                 </TableRow>
//               );
//             })
//           )}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }



















