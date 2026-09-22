import dayjs from "dayjs";
import "dayjs/locale/lt";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

export default function LtDatePicker({
  label,
  value,
  onChange,
  error = false,
  helperText,
  disabled = false,
  minDate,
  maxDate,
  size = "small",
  fullWidth = true,
}) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
      <DatePicker
        label={label}
        value={value ? dayjs(value) : null}
        onChange={(d) => onChange(d && d.isValid() ? d.format("YYYY-MM-DD") : "")}
        format="YYYY-MM-DD"
        disabled={disabled}
        minDate={minDate ? dayjs(minDate) : undefined}
        maxDate={maxDate ? dayjs(maxDate) : undefined}
        slotProps={{
          textField: { size, fullWidth, error, helperText },
          dialog: { disableScrollLock: true },
        }}
      />
    </LocalizationProvider>
  );
}