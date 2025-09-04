import { useState, useEffect } from "react";
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
} from "@mui/material";
import WarningIcon from '@mui/icons-material/Warning';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MoreVertIcon from '@mui/icons-material/MoreVert';

export default function DocumentsTable({
  filtered,
  loading,
  selectedRows,
  handleSelectRow,
  handleSelectAll,
  isRowExportable,
  reloadDocuments,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuRowId, setMenuRowId] = useState(null);
  const [localRows, setLocalRows] = useState(filtered);

  useEffect(() => {
    setLocalRows(filtered);
  }, [filtered]);

  const handleMenuOpen = (event, rowId) => {
    setAnchorEl(event.currentTarget);
    setMenuRowId(rowId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuRowId(null);
  };

  const handleDeleteRow = async (rowId) => {
    setLocalRows((rows) => rows.filter((row) => row.id !== rowId));
    handleMenuClose();
    try {
      await api.delete("/documents/bulk-delete/", { data: { ids: [rowId] } });
      if (typeof reloadDocuments === "function") reloadDocuments();
    } catch (e) {
      alert("Įvyko klaida trinant dokumentą.");
    }
  };

  const hasSumValidationError = (d) =>
    d.val_subtotal_match === false ||
    d.val_vat_match === false ||
    d.val_total_match === false;

  const canExport = (d) =>
    isRowExportable(d) &&
    !!d.pirkimas_pardavimas &&
    d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";

  const exportableRows = localRows.filter(canExport);

  const statusLabel = (d) => {
    if (d.status === "exported") return "Atliktas (Eksportuotas)";
    if (typeof d.statusLabel === "function") return d.statusLabel(d);
    return d.status || "";
  };

  const iconForStatus = (d) => {
    if (d.status === "exported") {
      return <CheckCircleIcon color="success" sx={{ verticalAlign: 'middle' }} />;
    }
    if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
    return null;
  };

  // ---- Skaitmenizavimo tipas (scan_type) ----
  const renderScanType = (d) => {
    const t = d?.scan_type;
    if (!t) {
      return (
        <Tooltip title="Nežinomas skaitmenizavimo tipas">
          <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
            <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} />
            Nežinomas
          </span>
        </Tooltip>
      );
    }

    const mapping = {
      sumiskai: "Sumiškai",
      // при необходимости добавляй другие:
      // invoice: "Sąskaita",
      // receipt: "Kvitas",
    };

    if (mapping[t]) return mapping[t];

    const label = String(t).replace(/_/g, " ").toLowerCase();
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  return (
    <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                indeterminate={
                  selectedRows.length > 0 &&
                  selectedRows.length < exportableRows.length
                }
                checked={
                  exportableRows.length > 0 &&
                  selectedRows.length === exportableRows.length
                }
                onChange={handleSelectAll}
                inputProps={{ "aria-label": "select all exportable" }}
              />
            </TableCell>
            <TableCell>Failas</TableCell>
            <TableCell>Skaitmenizavimo tipas</TableCell>
            <TableCell>Pirkimas / pardavimas</TableCell>
            <TableCell>Statusas</TableCell>
            <TableCell>Data</TableCell>
            <TableCell align="right"></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow>
              {/* 7 колонок: checkbox + 6 ячеек */}
              <TableCell colSpan={7} align="center">
                <CircularProgress size={24} />
              </TableCell>
            </TableRow>
          ) : (
            localRows.map((d, idx) => {
              const tipasIsKnown =
                d.pirkimas_pardavimas &&
                d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";

              const tipasValue = tipasIsKnown
                ? (d.pirkimas_pardavimas.charAt(0).toUpperCase() +
                   d.pirkimas_pardavimas.slice(1))
                : (
                  <Tooltip title="Nežinomas tipas. Atnaujinkite pirkėjo ar pardavėjo duomenis.">
                    <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
                      <HelpOutlineIcon fontSize="small" style={{ marginRight: 4 }} />
                      Nežinomas
                    </span>
                  </Tooltip>
                );

              return (
                <TableRow key={d.id || idx} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedRows.includes(d.id)}
                      onChange={handleSelectRow(d.id)}
                      disabled={!canExport(d)}
                      inputProps={{ "aria-label": "select row" }}
                    />
                  </TableCell>

                  <TableCell
                    sx={{ cursor: "pointer", color: "primary.main" }}
                    onClick={() => d.onClickPreview(d)}
                  >
                    {d.original_filename}
                  </TableCell>

                  <TableCell>
                    {renderScanType(d)}
                  </TableCell>

                  <TableCell>
                    {tipasValue}
                  </TableCell>

                  <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
                    <Box display="flex" alignItems="center">
                      {iconForStatus(d)}&nbsp;{statusLabel(d)}
                      {hasSumValidationError(d) && (
                        <Tooltip title="Patikrinkite sumas">
                          <WarningIcon
                            color="warning"
                            fontSize="small"
                            sx={{ ml: 1, verticalAlign: 'middle', cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>

                  <TableCell>{d.fmt(d.uploaded_at)}</TableCell>

                  <TableCell align="right">
                    <IconButton onClick={(e) => handleMenuOpen(e, d.id)}>
                      <MoreVertIcon />
                    </IconButton>
                    <Menu
                      anchorEl={anchorEl}
                      open={Boolean(anchorEl) && menuRowId === d.id}
                      onClose={handleMenuClose}
                    >
                      <MenuItem onClick={() => handleDeleteRow(d.id)}>
                        Ištrinti
                      </MenuItem>
                    </Menu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}








// import { useState, useEffect } from "react";
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
// import WarningIcon from '@mui/icons-material/Warning';
// import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
// import CheckCircleIcon from '@mui/icons-material/CheckCircle';
// import MoreVertIcon from '@mui/icons-material/MoreVert';

// export default function DocumentsTable({
//   filtered,
//   loading,
//   selectedRows,
//   handleSelectRow,
//   handleSelectAll,
//   isRowExportable,
//   reloadDocuments, // функция из родителя
// }) {
//   const [anchorEl, setAnchorEl] = useState(null);
//   const [menuRowId, setMenuRowId] = useState(null);
//   const [localRows, setLocalRows] = useState(filtered);

//   // Синхронизация с пропами (при обновлении фильтра/документов)
//   useEffect(() => {
//     setLocalRows(filtered);
//   }, [filtered]);

//   const handleMenuOpen = (event, rowId) => {
//     setAnchorEl(event.currentTarget);
//     setMenuRowId(rowId);
//   };

//   const handleMenuClose = () => {
//     setAnchorEl(null);
//     setMenuRowId(null);
//   };

//   // Удаление строки — без confirm!
//   const handleDeleteRow = async (rowId) => {
//     setLocalRows((rows) => rows.filter((row) => row.id !== rowId));
//     handleMenuClose();
//     try {
//       await api.delete("/documents/bulk-delete/", {
//         data: { ids: [rowId] }
//       });
//       if (typeof reloadDocuments === "function") reloadDocuments();
//     } catch (e) {
//       alert("Įvyko klaida trinant dokumentą.");
//       // Если нужно вернуть обратно при ошибке — раскомментируй:
//       // setLocalRows((rows) => [...rows, filtered.find((row) => row.id === rowId)]);
//     }
//   };

//   const hasSumValidationError = (d) =>
//     d.val_subtotal_match === false ||
//     d.val_vat_match === false ||
//     d.val_total_match === false;

//   const canExport = (d) =>
//     isRowExportable(d) &&
//     !!d.pirkimas_pardavimas &&
//     d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";

//   const exportableRows = localRows.filter(canExport);

//   const statusLabel = (d) => {
//     if (d.status === "exported") return "Atliktas (Eksportuotas)";
//     if (typeof d.statusLabel === "function") return d.statusLabel(d);
//     return d.status || "";
//   };

//   const iconForStatus = (d) => {
//     if (d.status === "exported") {
//       return <CheckCircleIcon color="success" sx={{ verticalAlign: 'middle' }} />;
//     }
//     if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
//     return null;
//   };

//   return (
//     <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
//       <Table stickyHeader size="small">
//         <TableHead>
//           <TableRow>
//             <TableCell padding="checkbox">
//               <Checkbox
//                 indeterminate={
//                   selectedRows.length > 0 &&
//                   selectedRows.length < exportableRows.length
//                 }
//                 checked={
//                   exportableRows.length > 0 &&
//                   selectedRows.length === exportableRows.length
//                 }
//                 onChange={handleSelectAll}
//                 inputProps={{ "aria-label": "select all exportable" }}
//               />
//             </TableCell>
//             <TableCell>Failas</TableCell>
//             <TableCell>Skaitmenizavimo tipas</TableCell>
//             <TableCell>Pirkimas / pardavimas</TableCell>
//             <TableCell>Statusas</TableCell>
//             <TableCell>Data</TableCell>
//             <TableCell align="right"></TableCell>
//           </TableRow>
//         </TableHead>
//         <TableBody>
//           {loading ? (
//             <TableRow>
//               <TableCell colSpan={6} align="center">
//                 <CircularProgress size={24} />
//               </TableCell>
//             </TableRow>
//           ) : (
//             localRows.map((d, idx) => {
//               const tipasIsKnown =
//                 d.pirkimas_pardavimas &&
//                 d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";

//               let tipasValue = tipasIsKnown
//                 ? (d.pirkimas_pardavimas.charAt(0).toUpperCase() +
//                   d.pirkimas_pardavimas.slice(1))
//                 : (
//                   <Tooltip title="Nežinomas tipas. Atnaujinkite pirkėjo ar pardavėjo duomenis.">
//                     <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
//                       <HelpOutlineIcon fontSize="small" sx={{ mr: 0.5 }} />
//                       Nežinomas
//                     </span>
//                   </Tooltip>
//                 );

//               return (
//                 <TableRow key={d.id || idx} hover>
//                   <TableCell padding="checkbox">
//                     <Checkbox
//                       checked={selectedRows.includes(d.id)}
//                       onChange={handleSelectRow(d.id)}
//                       disabled={!canExport(d)}
//                       inputProps={{ "aria-label": "select row" }}
//                     />
//                   </TableCell>
//                   <TableCell
//                     sx={{ cursor: "pointer", color: "primary.main" }}
//                     onClick={() => d.onClickPreview(d)}
//                   >
//                     {d.original_filename}
//                   </TableCell>
//                   <TableCell>
//                     {tipasValue}
//                   </TableCell>
//                   {/* Исправленный Statusas */}
//                   <TableCell sx={{ verticalAlign: "middle", minHeight: 44 }}>
//                     <Box display="flex" alignItems="center">
//                       {iconForStatus(d)}&nbsp;{statusLabel(d)}
//                       {hasSumValidationError(d) && (
//                         <Tooltip title="Patikrinkite sumas">
//                           <WarningIcon
//                             color="warning"
//                             fontSize="small"
//                             sx={{ ml: 1, verticalAlign: 'middle', cursor: 'pointer' }}
//                           />
//                         </Tooltip>
//                       )}
//                     </Box>
//                   </TableCell>
//                   <TableCell>{d.fmt(d.uploaded_at)}</TableCell>
//                   <TableCell align="right">
//                     <IconButton onClick={(e) => handleMenuOpen(e, d.id)}>
//                       <MoreVertIcon />
//                     </IconButton>
//                     <Menu
//                       anchorEl={anchorEl}
//                       open={Boolean(anchorEl) && menuRowId === d.id}
//                       onClose={handleMenuClose}
//                     >
//                       <MenuItem onClick={() => handleDeleteRow(d.id)}>
//                         Ištrinti
//                       </MenuItem>
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
// } from "@mui/material";
// import WarningIcon from '@mui/icons-material/Warning';
// import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
// import CheckCircleIcon from '@mui/icons-material/CheckCircle';

// export default function DocumentsTable({
//   filtered,
//   loading,
//   selectedRows,
//   handleSelectRow,
//   handleSelectAll,
//   isRowExportable,
// }) {
//   // Проверка на ошибку суммы
//   const hasSumValidationError = (d) =>
//     // d.val_ar_sutapo === false ||
//     d.val_subtotal_match === false ||
//     d.val_vat_match === false ||
//     d.val_total_match === false;

//   // Можно ли экспортировать (тип определён и строка экспортируемая)
//   const canExport = (d) =>
//     isRowExportable(d) &&
//     !!d.pirkimas_pardavimas &&
//     d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";

//   // Только экспортируемые строки
//   const exportableRows = filtered.filter(canExport);

//   // Статус документа
//   const statusLabel = (d) => {
//     if (d.status === "exported") return "Atliktas (Eksportuotas)";
//     if (typeof d.statusLabel === "function") return d.statusLabel(d);
//     return d.status || "";
//   };

//   // Статус-иконка
//   const iconForStatus = (d) => {
//     if (d.status === "exported") {
//       return <CheckCircleIcon color="success" sx={{ verticalAlign: 'middle' }} />;
//     }
//     if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
//     return null;
//   };

//   return (
//     <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
//       <Table stickyHeader size="small">
//         <TableHead>
//           <TableRow>
//             <TableCell padding="checkbox">
//               <Checkbox
//                 indeterminate={
//                   selectedRows.length > 0 &&
//                   selectedRows.length < exportableRows.length
//                 }
//                 checked={
//                   exportableRows.length > 0 &&
//                   selectedRows.length === exportableRows.length
//                 }
//                 onChange={handleSelectAll}
//                 inputProps={{ "aria-label": "select all exportable" }}
//               />
//             </TableCell>
//             <TableCell>Failas</TableCell>
//             <TableCell>Tipas</TableCell>
//             <TableCell>Statusas</TableCell>
//             <TableCell>Data</TableCell>
//           </TableRow>
//         </TableHead>
//         <TableBody>
//           {loading ? (
//             <TableRow>
//               <TableCell colSpan={5} align="center">
//                 <CircularProgress size={24} />
//               </TableCell>
//             </TableRow>
//           ) : (
//             filtered.map((d, idx) => {
//               const tipasIsKnown =
//                 d.pirkimas_pardavimas &&
//                 d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";

//               let tipasValue = tipasIsKnown
//                 ? (d.pirkimas_pardavimas.charAt(0).toUpperCase() +
//                   d.pirkimas_pardavimas.slice(1))
//                 : (
//                   <Tooltip title="Nežinomas tipas. Atnaujinkite pirkėjo ar pardavėjo duomenis.">
//                     <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
//                       <HelpOutlineIcon fontSize="small" sx={{ mr: 0.5 }} />
//                       Nežinomas
//                     </span>
//                   </Tooltip>
//                 );

//               return (
//                 <TableRow key={d.id || idx} hover>
//                   <TableCell padding="checkbox">
//                     <Checkbox
//                       checked={selectedRows.includes(d.id)}
//                       onChange={handleSelectRow(d.id)}
//                       disabled={!canExport(d)}
//                       inputProps={{ "aria-label": "select row" }}
//                     />
//                   </TableCell>
//                   <TableCell
//                     sx={{ cursor: "pointer", color: "primary.main" }}
//                     onClick={() => d.onClickPreview(d)}
//                   >
//                     {d.original_filename}
//                   </TableCell>
//                   <TableCell>
//                     {tipasValue}
//                   </TableCell>
//                   <TableCell
//                     sx={{
//                       verticalAlign: "middle",
//                       display: "flex",
//                       alignItems: "center",
//                       minHeight: 44,
//                     }}
//                   >
//                     {iconForStatus(d)}&nbsp;{statusLabel(d)}
//                     {hasSumValidationError(d) && (
//                       <Tooltip title="Patikrinkite sumas">
//                         <WarningIcon
//                           color="warning"
//                           fontSize="small"
//                           sx={{ ml: 1, verticalAlign: 'middle', cursor: 'pointer' }}
//                         />
//                       </Tooltip>
//                     )}
//                   </TableCell>
//                   <TableCell>{d.fmt(d.uploaded_at)}</TableCell>
//                 </TableRow>
//               );
//             })
//           )}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }
