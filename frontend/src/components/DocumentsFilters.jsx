import { useEffect } from "react";
import { Box, TextField, MenuItem } from "@mui/material";

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

export default function DocumentsFilters({ filters, onFilterChange }) {
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