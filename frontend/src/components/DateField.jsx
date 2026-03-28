import { useState, useEffect, useRef } from 'react';
import { Box, TextField, InputAdornment, IconButton } from '@mui/material';
import { CalendarToday as CalendarIcon } from '@mui/icons-material';

// iso → display
const isoToDisplay = (iso) => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

// display → iso (lenient)
const displayToIso = (txt) => {
  // accept dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy
  const m = txt.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, '0');
  const mo = m[2].padStart(2, '0');
  const y = m[3];
  // basic validation
  const date = new Date(`${y}-${mo}-${d}`);
  if (isNaN(date.getTime())) return null;
  return `${y}-${mo}-${d}`;
};

const DateField = ({ value, onChange, label, disabled, ...props }) => {
  const hiddenRef = useRef(null);
  const [text, setText] = useState(isoToDisplay(value));
  const [error, setError] = useState(false);

  // Sync from parent when value changes externally
  useEffect(() => {
    setText(isoToDisplay(value));
    setError(false);
  }, [value]);

  const handleTextChange = (e) => {
    const v = e.target.value;
    // Allow only digits and separators while typing
    if (v && !/^[\d/.\-]*$/.test(v)) return;
    setText(v);

    // Auto-insert separators
    const digits = v.replace(/\D/g, '');
    if (digits.length >= 8) {
      const formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
      setText(formatted);
      const iso = displayToIso(formatted);
      if (iso) {
        setError(false);
        onChange(iso);
      } else {
        setError(true);
      }
      return;
    }

    // Try to parse partial/complete input
    const iso = displayToIso(v);
    if (iso) {
      setError(false);
      onChange(iso);
    } else if (v.length >= 10) {
      setError(true);
    } else {
      setError(false);
    }
  };

  const handleBlur = () => {
    if (!text) {
      onChange('');
      setError(false);
      return;
    }
    const iso = displayToIso(text);
    if (iso) {
      setText(isoToDisplay(iso));
      setError(false);
    } else {
      // Revert to last valid value
      setText(isoToDisplay(value));
      setError(false);
    }
  };

  const openCalendar = () => {
    if (disabled) return;
    hiddenRef.current?.showPicker?.();
    hiddenRef.current?.click?.();
  };

  const handleCalendarChange = (e) => {
    const iso = e.target.value;
    if (iso) {
      onChange(iso);
      setText(isoToDisplay(iso));
      setError(false);
    }
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <TextField
        {...props}
        fullWidth
        label={label}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        disabled={disabled}
        error={error}
        placeholder="dd/mm/yyyy"
        InputLabelProps={{ shrink: true }}
        InputProps={{
          endAdornment: !disabled && (
            <InputAdornment position="end">
              <IconButton size="small" onClick={openCalendar} edge="end" tabIndex={-1}>
                <CalendarIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </InputAdornment>
          ),
          ...props.InputProps,
        }}
        inputProps={{ maxLength: 10, ...props.inputProps }}
      />
      {/* Hidden native date input for calendar popup */}
      <input
        ref={hiddenRef}
        type="date"
        value={value || ''}
        onChange={handleCalendarChange}
        style={{
          position: 'absolute', bottom: 0, left: 0,
          width: 0, height: 0, opacity: 0, overflow: 'hidden',
          pointerEvents: 'none',
        }}
        tabIndex={-1}
      />
    </Box>
  );
};

export default DateField;