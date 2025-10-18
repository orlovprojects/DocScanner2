import React, { useState, useRef } from "react";
import {
  Box, Typography, IconButton, TextField, CircularProgress, Tooltip, Autocomplete,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

export default function EditableCell({
  value,
  onSave,                 // (nextValue) => Promise<void>
  renderDisplay,          // (value) => ReactNode
  inputType = "text",     // 'text' | 'number' | 'date' | 'select'
  options = [],           // для select: ['EUR','USD'] или [{label, value}]
  getOptionLabel,         // (opt) => string, опционально
  placeholder = "—",
  disabled = false,
  sx,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);

  const showVal = (v) => (renderDisplay ? renderDisplay(v) : (v ?? placeholder));

  const startEdit = () => {
    if (disabled) return;
    setDraft(value ?? "");
    setErr("");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus?.(), 0);
  };

  const cancel = () => {
    setEditing(false);
    setErr("");
    setDraft(value ?? "");
  };

  const commit = async (nextVal = draft) => {
    if (disabled || loading) return;
    const v = nextVal === "" ? null : nextVal;
    try {
      setLoading(true);
      setErr("");
      await onSave(v);
      setEditing(false);
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Nepavyko išsaugoti");
    } finally {
      setLoading(false);
    }
  };

  // ---- Рендер ввода по типу ----
  const renderEditor = () => {
    if (inputType === "date") {
      return (
        <DatePicker
          value={draft ? dayjs(draft) : null}
          format="YYYY-MM-DD"
          onChange={(d) => setDraft(d ? d.format("YYYY-MM-DD") : "")}
          slotProps={{
            textField: {
              variant: "standard",
              size: "small",
              onKeyDown: (e) => { 
                if (e.key === "Escape") cancel(); 
                if (e.key === "Enter") commit(); 
              },
              // УБИРАЕМ onBlur - это и была проблема!
            },
          }}
        />
      );
    }

    if (inputType === "select") {
      return (
        <Autocomplete
          options={options}
          getOptionLabel={getOptionLabel || ((opt) => (typeof opt === "string" ? opt : opt?.label ?? ""))}
          isOptionEqualToValue={(opt, val) => (opt?.value ?? opt) === (val?.value ?? val)}
          value={options.find((o) => (o?.value ?? o) === (draft ?? value)) ?? null}
          onChange={(_, newVal) => {
            const val = typeof newVal === "string" ? newVal : (newVal?.value ?? null);
            setDraft(val);
            commit(val);
          }}
          disableClearable
          freeSolo={false}
          autoHighlight
          openOnFocus
          size="small"
          renderInput={(params) => (
            <TextField
              {...params}
              variant="standard"
              placeholder="Pasirinkite…"
              onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
            />
          )}
          sx={{ minWidth: 140 }}
        />
      );
    }

    // text/number
    return (
      <TextField
        inputRef={inputRef}
        size="small"
        value={draft ?? ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        onBlur={() => commit()} // для text/number оставляем
        type={inputType}
        variant="standard"
        sx={{ minWidth: 120, "& input": { fontWeight: 700, px: 0.5 } }}
      />
    );
  };

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        "&:hover .ec-edit": { opacity: disabled ? 0 : 1, pointerEvents: disabled ? "none" : "auto" },
        ...sx,
      }}
    >
      {!editing ? (
        <>
          <Typography component="span" fontWeight={700}>{showVal(value)}</Typography>
          <Tooltip title={disabled ? "" : "Redaguoti"}>
            <IconButton
              size="small"
              className="ec-edit"
              onClick={startEdit}
              sx={{ ml: 0.5, opacity: 0, transition: "opacity .15s ease" }}
            >
              <EditIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
          {renderEditor()}
          {loading ? (
            <CircularProgress size={18} sx={{ ml: 0.5 }} />
          ) : (
            <>
              <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => commit()}>
                <CheckIcon fontSize="inherit" />
              </IconButton>
              <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={cancel}>
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </>
          )}
        </Box>
      )}
      {!!err && <Typography component="span" color="error" sx={{ ml: 1, fontSize: 12 }}>{err}</Typography>}
    </Box>
  );
}





// import React, { useState, useRef } from "react";
// import {
//   Box, Typography, IconButton, TextField, CircularProgress, Tooltip, Autocomplete,
// } from "@mui/material";
// import EditIcon from "@mui/icons-material/Edit";
// import CheckIcon from "@mui/icons-material/Check";
// import CloseIcon from "@mui/icons-material/Close";
// import { DatePicker } from "@mui/x-date-pickers/DatePicker";
// import dayjs from "dayjs";

// export default function EditableCell({
//   value,
//   onSave,                 // (nextValue) => Promise<void>
//   renderDisplay,          // (value) => ReactNode
//   inputType = "text",     // 'text' | 'number' | 'date' | 'select'
//   options = [],           // для select: ['EUR','USD'] или [{label, value}]
//   getOptionLabel,         // (opt) => string, опционально
//   placeholder = "—",
//   disabled = false,
//   sx,
// }) {
//   const [editing, setEditing] = useState(false);
//   const [draft, setDraft] = useState(value ?? "");
//   const [loading, setLoading] = useState(false);
//   const [err, setErr] = useState("");
//   const inputRef = useRef(null);

//   const showVal = (v) => (renderDisplay ? renderDisplay(v) : (v ?? placeholder));

//   const startEdit = () => {
//     if (disabled) return;
//     setDraft(value ?? "");
//     setErr("");
//     setEditing(true);
//     setTimeout(() => inputRef.current?.focus?.(), 0);
//   };

//   const cancel = () => {
//     setEditing(false);
//     setErr("");
//     setDraft(value ?? "");
//   };

//   const commit = async (nextVal = draft) => {
//     if (disabled || loading) return;
//     const v = nextVal === "" ? null : nextVal;
//     try {
//       setLoading(true);
//       setErr("");
//       await onSave(v);
//       setEditing(false);
//     } catch (e) {
//       setErr(e?.response?.data?.detail || e?.message || "Nepavyko išsaugoti");
//     } finally {
//       setLoading(false);
//     }
//   };

//   // ---- Рендер ввода по типу ----
//   const renderEditor = () => {
//     if (inputType === "date") {
//       return (
//         <DatePicker
//           value={draft ? dayjs(draft) : null}
//           format="YYYY-MM-DD"
//           onChange={(d) => setDraft(d ? d.format("YYYY-MM-DD") : "")}
//           onAccept={() => commit()}
//           slotProps={{
//             textField: {
//               variant: "standard",
//               size: "small",
//               onKeyDown: (e) => { if (e.key === "Escape") cancel(); if (e.key === "Enter") commit(); },
//             },
//           }}
//         />
//       );
//     }

//     if (inputType === "select") {
//       return (
//         <Autocomplete
//           options={options}
//           getOptionLabel={getOptionLabel || ((opt) => (typeof opt === "string" ? opt : opt?.label ?? ""))}
//           isOptionEqualToValue={(opt, val) => (opt?.value ?? opt) === (val?.value ?? val)}
//           value={options.find((o) => (o?.value ?? o) === (draft ?? value)) ?? null}
//           onChange={(_, newVal) => {
//             const val = typeof newVal === "string" ? newVal : (newVal?.value ?? null);
//             setDraft(val);
//             commit(val);
//           }}
//           disableClearable
//           freeSolo={false}
//           autoHighlight
//           openOnFocus
//           size="small"
//           renderInput={(params) => (
//             <TextField
//               {...params}
//               variant="standard"
//               placeholder="Pasirinkite…"
//               onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
//             />
//           )}
//           sx={{ minWidth: 140 }}
//         />
//       );
//     }

//     // text/number
//     return (
//       <TextField
//         inputRef={inputRef}
//         size="small"
//         value={draft ?? ""}
//         onChange={(e) => setDraft(e.target.value)}
//         onKeyDown={(e) => {
//           if (e.key === "Enter") commit();
//           if (e.key === "Escape") cancel();
//         }}
//         onBlur={() => commit()} // авто-сохранение по уходу фокуса
//         type={inputType}
//         variant="standard"
//         sx={{ minWidth: 120, "& input": { fontWeight: 700, px: 0.5 } }}
//       />
//     );
//   };

//   return (
//     <Box
//       sx={{
//         display: "inline-flex",
//         alignItems: "center",
//         position: "relative",
//         "&:hover .ec-edit": { opacity: disabled ? 0 : 1, pointerEvents: disabled ? "none" : "auto" },
//         ...sx,
//       }}
//     >
//       {!editing ? (
//         <>
//           <Typography component="span" fontWeight={700}>{showVal(value)}</Typography>
//           <Tooltip title={disabled ? "" : "Redaguoti"}>
//             <IconButton
//               size="small"
//               className="ec-edit"
//               onClick={startEdit}
//               sx={{ ml: 0.5, opacity: 0, transition: "opacity .15s ease" }}
//             >
//               <EditIcon fontSize="inherit" />
//             </IconButton>
//           </Tooltip>
//         </>
//       ) : (
//         <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
//           {renderEditor()}
//           {loading ? (
//             <CircularProgress size={18} sx={{ ml: 0.5 }} />
//           ) : (
//             <>
//               <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={() => commit()}>
//                 <CheckIcon fontSize="inherit" />
//               </IconButton>
//               <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={cancel}>
//                 <CloseIcon fontSize="inherit" />
//               </IconButton>
//             </>
//           )}
//         </Box>
//       )}
//       {!!err && <Typography component="span" color="error" sx={{ ml: 1, fontSize: 12 }}>{err}</Typography>}
//     </Box>
//   );
// }

