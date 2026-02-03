import { useEffect, useState } from "react";
import { 
  Box, 
  TextField, 
  MenuItem, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails, 
  Typography,
  useTheme,
  useMediaQuery,
  Chip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterListIcon from "@mui/icons-material/FilterList";

const STATUS_OPTIONS = [
  { value: "", label: "Visi" },
  { value: "processing", label: "Vykdomi" },
  { value: "rejected", label: "Atmesti" },
  { value: "completed", label: "Atlikti (Neeksportuoti)" },
  { value: "exported", label: "Atlikti (Eksportuoti)" },
];

// Форматирует дату как yyyy-mm-dd
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

// Форматирует дату для отображения (короткий формат)
function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("lt-LT", {
    month: "2-digit",
    day: "2-digit",
  });
}

export default function DocumentsFilters({ filters, onFilterChange }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!filters.dateFrom && !filters.dateTo) {
      const today = new Date();
      const from = new Date();
      from.setDate(today.getDate() - 29); // последние 30 дней
      onFilterChange("dateFrom")({ target: { value: formatDate(from) } });
      onFilterChange("dateTo")({ target: { value: formatDate(today) } });
    }
    // eslint-disable-next-line
  }, []);

  // Подсчёт активных фильтров (кроме дат по умолчанию)
  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.status) count++;
    // Даты не считаем, так как они всегда установлены
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();

  // Получить label текущего статуса
  const getStatusLabel = () => {
    const option = STATUS_OPTIONS.find((o) => o.value === filters.status);
    return option?.label || "Visi";
  };

  // Desktop: обычный inline layout
  if (!isMobile) {
    return (
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <TextField
          select
          size="small"
          label="Statusas"
          value={filters.status}
          onChange={onFilterChange("status")}
          sx={{ minWidth: 210 }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{
            displayEmpty: true,
            renderValue: (value) => {
              const option = STATUS_OPTIONS.find((o) => o.value === value);
              return option?.label || "Visi";
            },
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          size="small"
          label="Nuo"
          value={filters.dateFrom || ""}
          onChange={onFilterChange("dateFrom")}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date"
          size="small"
          label="Iki"
          value={filters.dateTo || ""}
          onChange={onFilterChange("dateTo")}
          InputLabelProps={{ shrink: true }}
        />
      </Box>
    );
  }

  // Mobile: collapsible accordion
  return (
    <Accordion 
      expanded={expanded} 
      onChange={(e, isExpanded) => setExpanded(isExpanded)}
      sx={{ 
        mb: 2, 
        borderRadius: '12px !important',
        '&:before': { display: 'none' },
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <AccordionSummary 
        expandIcon={<ExpandMoreIcon />}
        sx={{ 
          minHeight: 48,
          '& .MuiAccordionSummary-content': { 
            alignItems: 'center',
            gap: 1,
            my: 1,
          },
        }}
      >
        <FilterListIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          Filtrai
        </Typography>
        
        {/* Показываем краткую информацию о фильтрах когда свёрнуто */}
        {!expanded && (
          <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto', mr: 1, flexWrap: 'wrap' }}>
            <Chip 
              label={`${formatDateDisplay(filters.dateFrom)} - ${formatDateDisplay(filters.dateTo)}`}
              size="small"
              variant="outlined"
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
            {filters.status && (
              <Chip 
                label={getStatusLabel()}
                size="small"
                color="primary"
                sx={{ height: 24, fontSize: '0.75rem' }}
              />
            )}
          </Box>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, pb: 2 }}>
        <Box display="flex" flexDirection="column" gap={2}>
          <TextField
            select
            size="small"
            label="Statusas"
            value={filters.status}
            onChange={onFilterChange("status")}
            fullWidth
            InputLabelProps={{ shrink: true }}
            SelectProps={{
              displayEmpty: true,
              renderValue: (value) => {
                const option = STATUS_OPTIONS.find((o) => o.value === value);
                return option?.label || "Visi";
              },
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          
          <Box display="flex" gap={2}>
            <TextField
              type="date"
              size="small"
              label="Nuo"
              value={filters.dateFrom || ""}
              onChange={onFilterChange("dateFrom")}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              type="date"
              size="small"
              label="Iki"
              value={filters.dateTo || ""}
              onChange={onFilterChange("dateTo")}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Box>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}


// import { useEffect } from "react";
// import { Box, TextField, MenuItem } from "@mui/material";

// const STATUS_OPTIONS = [
//   { value: "", label: "Visi" },
//   { value: "processing", label: "Vykdomi" },
//   { value: "rejected", label: "Atmesti" },
//   { value: "completed", label: "Atlikti (Neeksportuoti)" },
//   { value: "exported", label: "Atlikti (Eksportuoti)" },
// ];

// // Форматирует дату как yyyy-mm-dd
// function formatDate(date) {
//   return date.toISOString().slice(0, 10);
// }

// export default function DocumentsFilters({ filters, onFilterChange }) {
//   useEffect(() => {
//     if (!filters.dateFrom && !filters.dateTo) {
//       const today = new Date();
//       const from = new Date();
//       from.setDate(today.getDate() - 29); // последние 30 дней
//       onFilterChange("dateFrom")({ target: { value: formatDate(from) } });
//       onFilterChange("dateTo")({ target: { value: formatDate(today) } });
//     }
//     // eslint-disable-next-line
//   }, []);

//   return (
//     <Box display="flex" gap={2} mb={3} flexWrap="wrap">
//       <TextField
//         select
//         size="small"
//         label="Statusas"
//         value={filters.status}
//         onChange={onFilterChange("status")}
//         sx={{ minWidth: 210 }}
//         InputLabelProps={{ shrink: true }}
//         SelectProps={{
//           displayEmpty: true,
//           renderValue: (value) => {
//             const option = STATUS_OPTIONS.find((o) => o.value === value);
//             return option?.label || "Visi";
//           },
//         }}
//       >
//         {STATUS_OPTIONS.map((o) => (
//           <MenuItem key={o.value} value={o.value}>
//             {o.label}
//           </MenuItem>
//         ))}
//       </TextField>
//       <TextField
//         type="date"
//         size="small"
//         label="Nuo"
//         value={filters.dateFrom || ""}
//         onChange={onFilterChange("dateFrom")}
//         InputLabelProps={{ shrink: true }}
//       />
//       <TextField
//         type="date"
//         size="small"
//         label="Iki"
//         value={filters.dateTo || ""}
//         onChange={onFilterChange("dateTo")}
//         InputLabelProps={{ shrink: true }}
//       />
//     </Box>
//   );
// }