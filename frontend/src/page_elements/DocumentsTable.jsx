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
} from "@mui/material";
import WarningIcon from '@mui/icons-material/Warning';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function DocumentsTable({
  filtered,
  loading,
  selectedRows,
  handleSelectRow,
  handleSelectAll,
  isRowExportable,
}) {
  // Проверка на ошибку суммы
  const hasSumValidationError = (d) =>
    d.val_ar_sutapo === false ||
    d.val_subtotal_match === false ||
    d.val_vat_match === false ||
    d.val_total_match === false;

  // Можно ли экспортировать (тип определён и строка экспортируемая)
  const canExport = (d) =>
    isRowExportable(d) &&
    !!d.pirkimas_pardavimas &&
    d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";

  // Только экспортируемые строки
  const exportableRows = filtered.filter(canExport);

  // Статус документа
  const statusLabel = (d) => {
    if (d.status === "exported") return "Atliktas (Eksportuotas)";
    if (typeof d.statusLabel === "function") return d.statusLabel(d);
    return d.status || "";
  };

  // Статус-иконка
  const iconForStatus = (d) => {
    if (d.status === "exported") {
      return <CheckCircleIcon color="success" sx={{ verticalAlign: 'middle' }} />;
    }
    if (typeof d.iconForStatus === "function") return d.iconForStatus(d.status);
    return null;
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
            <TableCell>Tipas</TableCell>
            <TableCell>Statusas</TableCell>
            <TableCell>Data</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} align="center">
                <CircularProgress size={24} />
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((d, idx) => {
              const tipasIsKnown =
                d.pirkimas_pardavimas &&
                d.pirkimas_pardavimas.toLowerCase() !== "nezinoma";

              let tipasValue = tipasIsKnown
                ? (d.pirkimas_pardavimas.charAt(0).toUpperCase() +
                  d.pirkimas_pardavimas.slice(1))
                : (
                  <Tooltip title="Nežinomas tipas. Atnaujinkite pirkėjo ar pardavėjo duomenis.">
                    <span style={{ color: "#bdbdbd", display: "flex", alignItems: "center" }}>
                      <HelpOutlineIcon fontSize="small" sx={{ mr: 0.5 }} />
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
                    {tipasValue}
                  </TableCell>
                  <TableCell
                    sx={{
                      verticalAlign: "middle",
                      display: "flex",
                      alignItems: "center",
                      minHeight: 44,
                    }}
                  >
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
                  </TableCell>
                  <TableCell>{d.fmt(d.uploaded_at)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}









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

// export default function DocumentsTable({
//   filtered,
//   loading,
//   selectedRows,
//   isRowExportable,
//   handleSelectRow,
//   handleSelectAll,
// }) {
//   // Проверка на ошибку суммы
//   const hasSumValidationError = (d) =>
//     d.val_ar_sutapo === false ||
//     d.val_subtotal_match === false ||
//     d.val_vat_match === false ||
//     d.val_total_match === false;

//   return (
//     <TableContainer component={Paper} sx={{ maxHeight: 580 }}>
//       <Table stickyHeader size="small">
//         <TableHead>
//           <TableRow>
//             <TableCell padding="checkbox">
//               <Checkbox
//                 indeterminate={
//                   selectedRows.length > 0 &&
//                   selectedRows.length < filtered.filter(isRowExportable).length
//                 }
//                 checked={
//                   filtered.filter(isRowExportable).length > 0 &&
//                   selectedRows.length === filtered.filter(isRowExportable).length
//                 }
//                 onChange={handleSelectAll}
//                 inputProps={{ "aria-label": "select all exportable" }}
//               />
//             </TableCell>
//             <TableCell>Failas</TableCell>
//             <TableCell>Statusas</TableCell>
//             <TableCell>Data</TableCell>
//           </TableRow>
//         </TableHead>
//         <TableBody>
//           {loading ? (
//             <TableRow>
//               <TableCell colSpan={4} align="center">
//                 <CircularProgress size={24} />
//               </TableCell>
//             </TableRow>
//           ) : (
//             filtered.map((d, idx) => (
//               <TableRow key={d.id || idx} hover>
//                 <TableCell padding="checkbox">
//                   <Checkbox
//                     checked={selectedRows.includes(d.id)}
//                     onChange={handleSelectRow(d.id)}
//                     disabled={!isRowExportable(d)}
//                     inputProps={{ "aria-label": "select row" }}
//                   />
//                 </TableCell>
//                 <TableCell
//                   sx={{ cursor: "pointer", color: "primary.main" }}
//                   onClick={() => d.onClickPreview(d)}
//                 >
//                   {d.original_filename}
//                 </TableCell>
//                 <TableCell>
//                   {d.iconForStatus(d.status)}&nbsp;{d.statusLabel(d)}
//                   {hasSumValidationError(d) && (
//                     <Tooltip title="Patikrinkite sumas">
//                       <WarningIcon
//                         color="warning"
//                         fontSize="small"
//                         sx={{ ml: 1, verticalAlign: 'middle', cursor: 'pointer' }}
//                       />
//                     </Tooltip>
//                   )}
//                 </TableCell>
//                 <TableCell>{d.fmt(d.uploaded_at)}</TableCell>
//               </TableRow>
//             ))
//           )}
//         </TableBody>
//       </Table>
//     </TableContainer>
//   );
// }