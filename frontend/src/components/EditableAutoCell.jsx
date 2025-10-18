// EditableAutoCell.jsx
import React, { useState, useRef, useEffect } from "react";
import {
  Box, Typography, IconButton, TextField, CircularProgress, Tooltip, Autocomplete,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { api } from "../api/endpoints";

export default function EditableAutoCell({
  fieldName,                 // 'prekes_*' или 'buyer_*' / 'seller_*'
  label = "Pasirinkite…",
  value,
  searchUrl,
  onSelect,                  // (obj) => void
  onManualSave,              // (text|null) => Promise<void>
  onClear,                   // () => Promise<void> | void
  sx,
}) {
  const rootRef = useRef(null);

  const [mode, setMode] = useState("display"); // 'display' | 'edit' | 'search'
  const [draft, setDraft] = useState(value || "");
  const [loading, setLoading] = useState(false);

  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const openedOnceRef = useRef(false);

  // защита от гонок + дебаунс
  const lastReqIdRef = useRef(0);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    if (mode === "display") setDraft(value || "");
  }, [value, mode]);

  // клик-вне (закрывает edit/search)
  useEffect(() => {
    const onDocDown = (e) => {
      if (mode === "display") return;
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) {
        setMode("display");
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [mode]);

  // Маппинг ключей запроса для разных полей
  const qKeyByField = {
    // продукты
    prekes_pavadinimas: "q",
    prekes_kodas: "code",
    prekes_barkodas: "barcode",
    // клиенты
    buyer_name: "q",
    seller_name: "q",
    buyer_id: "code",
    seller_id: "code",
    buyer_vat_code: "vat",
    seller_vat_code: "vat",
  };
  const qKey = qKeyByField[fieldName] || "q";

  const isClientField = fieldName?.startsWith("buyer_") || fieldName?.startsWith("seller_");
  const isIdField   = fieldName === "buyer_id" || fieldName === "seller_id";
  const isVatField  = fieldName === "buyer_vat_code" || fieldName === "seller_vat_code";

  // нормализация ввода под конкретные поля
  const normalizeForQuery = (raw) => {
    let s = String(raw || "");
    if (isIdField)  return s.replace(/\D+/g, "");                         // только цифры
    if (isVatField) return s.toUpperCase().replace(/[\s-]+/g, "");        // LT************
    return s.trim();
  };

  // теперь ищем с первого символа (и разрешаем пустую строку для стартового списка)
  const minLengthOK = (norm) => norm.length >= 1 || norm.length === 0;

  const getOptionLabel = (opt) => {
    if (!opt) return "";

    // для клиентов (buyer/seller)
    if (fieldName === "buyer_name" || fieldName === "seller_name")
      return opt.pavadinimas || opt.name || "";
    if (fieldName === "buyer_id" || fieldName === "seller_id")
      return opt.imones_kodas || opt.code || "";
    if (fieldName === "buyer_vat_code" || fieldName === "seller_vat_code")
      return opt.pvm_kodas || opt.vat || "";

    // для продуктов
    if (fieldName === "prekes_kodas") return opt.prekes_kodas || opt.code || "";
    if (fieldName === "prekes_barkodas") return opt.prekes_barkodas || opt.barkodas || opt.barcode || "";
    return opt.prekes_pavadinimas || opt.pavadinimas || opt.name || "";
  };

  const fetchOptions = async (text = "") => {
    if (!searchUrl) return;
    const myReqId = ++lastReqIdRef.current;
    setLoading(true);
    try {
      const norm = normalizeForQuery(text);

      if (!minLengthOK(norm)) {
        if (myReqId === lastReqIdRef.current) {
          setOptions([]);
          setLoading(false);
        }
        return;
      }

      const params = norm ? { [qKey]: norm, q: norm } : {}; // пустой запрос -> «все»/первая страница
      const { data } = await api.get(searchUrl, { params, withCredentials: true });

      if (myReqId !== lastReqIdRef.current) return;
      const arr = Array.isArray(data) ? data : (data.results || []);
      setOptions(arr);
      openedOnceRef.current = true;
    } catch {
      if (myReqId === lastReqIdRef.current) setOptions([]);
    } finally {
      if (myReqId === lastReqIdRef.current) setLoading(false);
    }
  };

  const startEdit = () => {
    setDraft(value || "");
    setMode("edit");
  };

  const startSearch = () => {
    setMode("search");
    setInputValue("");
    setSearchOpen(true);
    // сразу фетчим стартовый список, чтобы не видеть "no options"
    fetchOptions("");
  };

  const cancel = () => {
    setMode("display");
    setSearchOpen(false);
    setDraft(value || "");
  };

  const commitManual = async () => {
    if (!onManualSave) return cancel();
    try {
      setLoading(true);
      await onManualSave(draft || null);
      setMode("display");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (onClear) await onClear();
  };

  // дебаунс поиска
  useEffect(() => {
    if (mode !== "search") return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchOptions(inputValue);
    }, 250);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, mode]);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        minHeight: 28,
        position: "relative",
        "&:hover .ea-actions": { opacity: 1, pointerEvents: "auto" },
        ...sx,
      }}
    >
      {/* DISPLAY */}
      {mode === "display" && (
        <>
          <Typography component="span" sx={{ fontWeight: 700, lineHeight: "28px" }}>
            {value || "—"}
          </Typography>

          <Box
            className="ea-actions"
            sx={{
              display: "inline-flex",
              gap: 0.25,
              opacity: 0,
              transition: "opacity .15s",
              ml: 0.25,
            }}
          >
            <Tooltip title="Ieškoti">
              <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={startSearch} sx={{ p: 0.5 }}>
                <SearchIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Redaguoti">
              <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={startEdit} sx={{ p: 0.5 }}>
                <EditIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Ištrinti">
              <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={handleClear} sx={{ p: 0.5 }}>
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </Box>
        </>
      )}

      {/* EDIT */}
      {mode === "edit" && (
        <>
          <TextField
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            size="small"
            variant="standard"
            placeholder={label}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitManual();
              if (e.key === "Escape") cancel();
            }}
            sx={{ minWidth: 240, "& input": { fontWeight: 700, px: 0.5 } }}
          />
          {loading ? (
            <CircularProgress size={18} />
          ) : (
            <>
              <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={commitManual} sx={{ p: 0.5 }}>
                <CheckIcon fontSize="inherit" />
              </IconButton>
              <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={cancel} sx={{ p: 0.5 }}>
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </>
          )}
        </>
      )}

      {/* SEARCH */}
      {mode === "search" && (
        <Autocomplete
          disablePortal
          sx={{ minWidth: 360 }}
          options={options}
          loading={loading}
          value={null}
          open={searchOpen}
          noOptionsText={loading ? "" : "—"}  // не показываем "no options" во время первого запроса
          onOpen={() => {
            setSearchOpen(true);
            if (!openedOnceRef.current) fetchOptions("");
          }}
          onClose={(_, reason) => {
            if (reason !== "selectOption") {
              setSearchOpen(false);
              setMode("display");
            }
          }}
          inputValue={inputValue}
          onInputChange={(_, val) => setInputValue(val)}
          onChange={(_, newVal) => {
            if (!newVal) return;
            onSelect && onSelect(newVal);
            setSearchOpen(false);
            setMode("display");
          }}
          filterOptions={(x) => x}
          getOptionLabel={getOptionLabel}
          isOptionEqualToValue={(o, v) => getOptionLabel(o) === getOptionLabel(v)}
          autoHighlight
          includeInputInList
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              placeholder={label}
              variant="standard"
              size="small"
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
              onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
            />
          )}
          renderOption={(props, option) => {
            const isClient =
              isClientField || "imones_kodas" in option || "pvm_kodas" in option;

            if (isClient) {
              const title = option.pavadinimas || option.name || "—";
              const code  = option.imones_kodas || option.code || "";
              const vat   = option.pvm_kodas || option.vat || "";
              const subtitle = [code && `įmonės kodas: ${code}`, vat && `PVM: ${vat}`]
                .filter(Boolean)
                .join(" • ");

              return (
                <li {...props} key={`${code}-${vat}-${title}`}>
                  <Box sx={{ display: "flex", flexDirection: "column" }}>
                    <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
                    {subtitle && (
                      <Typography variant="caption" color="text.secondary">
                        {subtitle}
                      </Typography>
                    )}
                  </Box>
                </li>
              );
            }

            const name = option.prekes_pavadinimas || option.pavadinimas || option.name || "";
            const code = option.prekes_kodas || option.code || "";
            const bark = option.prekes_barkodas || option.barkodas || option.barcode || "";
            return (
              <li {...props} key={`${code}-${bark}-${name}`}>
                <Box sx={{ display:"flex", flexDirection:"column" }}>
                  <Typography sx={{ fontWeight: 600 }}>{name || "—"}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {code ? `kodas: ${code}` : ""}{code && bark ? " • " : ""}{bark ? `barkodas: ${bark}` : ""}
                  </Typography>
                </Box>
              </li>
            );
          }}
        />
      )}
    </Box>
  );
}








// import React, { useEffect, useMemo, useRef, useState } from "react";
// import {
//   Box,
//   Typography,
//   IconButton,
//   TextField,
//   CircularProgress,
//   Tooltip,
//   Autocomplete,
//   ToggleButtonGroup,
//   ToggleButton,
//   Stack,
// } from "@mui/material";
// import EditIcon from "@mui/icons-material/Edit";
// import CheckIcon from "@mui/icons-material/Check";
// import CloseIcon from "@mui/icons-material/Close";
// import SearchIcon from "@mui/icons-material/Search";
// import KeyboardIcon from "@mui/icons-material/Keyboard";
// import { api } from "../api/endpoints";

// /**
//  * Гибрид редактора:
//  * - режим "Paieška": Autocomplete с подзагрузкой
//  * - режим "Rankinis": ручной ввод + сохранение
//  *
//  * Props:
//  *  - label?: string (плейсхолдер)
//  *  - value: string | object (текущая отображаемая величина)
//  *  - renderDisplay?: (value) => ReactNode
//  *  - onSelect?: (optionObj) => Promise|void  // при выборе из списка
//  *  - onManualSave?: (text) => Promise|void   // при ручном вводе+✓
//  *  - disabled?: boolean
//  *  - searchUrl?: string                      // если есть — компонент сам дергает api.get(searchUrl, {q})
//  *  - fetcher?: (query) => Promise<options[]> // альтернативно можно передать свой загрузчик
//  *  - getOptionLabel?: (opt) => string
//  *  - isOptionEqualToValue?: (opt, val) => boolean
//  *  - sx?: object
//  */
// export default function EditableAutoCell({
//   label = "Pasirinkite…",
//   value,
//   renderDisplay,
//   onSelect,
//   onManualSave,
//   disabled = false,
//   searchUrl,
//   fetcher,
//   getOptionLabel,
//   isOptionEqualToValue,
//   sx,
// }) {
//   const [editing, setEditing] = useState(false);
//   const [mode, setMode] = useState("search"); // 'search' | 'manual'
//   const [draft, setDraft] = useState(
//     typeof value === "string" ? value : ""
//   );
//   const [options, setOptions] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const [err, setErr] = useState("");

//   const inputRef = useRef(null);
//   const loadedRef = useRef(false);
//   const abortRef = useRef(null);

//   const showVal = (v) =>
//     renderDisplay ? renderDisplay(v) : (v ?? "—");

//   const doFetch = async (q = "") => {
//     if (!searchUrl && !fetcher) return;
//     setLoading(true);
//     // отмена предыдущего запроса
//     if (abortRef.current) abortRef.current.abort();
//     const controller = new AbortController();
//     abortRef.current = controller;
//     try {
//       let data = [];
//       if (typeof fetcher === "function") {
//         data = await fetcher(q);
//       } else {
//         const params = q ? { q } : {};
//         const res = await api.get(searchUrl, {
//           params,
//           withCredentials: true,
//           signal: controller.signal,
//         });
//         data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
//       }
//       setOptions(data);
//       loadedRef.current = true;
//     } catch (e) {
//       if (e?.name !== "CanceledError" && e?.name !== "AbortError") {
//         // eslint-disable-next-line no-console
//         console.warn("Fetch options failed:", e);
//         setOptions([]);
//       }
//     } finally {
//       setLoading(false);
//     }
//   };

//   const startEdit = () => {
//     if (disabled) return;
//     setErr("");
//     setEditing(true);
//     setMode("search");
//     setDraft(typeof value === "string" ? value : "");
//     setTimeout(() => inputRef.current?.focus?.(), 0);
//     if (!loadedRef.current) doFetch();
//   };

//   const cancel = () => {
//     setEditing(false);
//     setErr("");
//     setMode("search");
//     setDraft(typeof value === "string" ? value : "");
//   };

//   const commitManual = async () => {
//     if (!onManualSave) return cancel();
//     try {
//       setErr("");
//       await onManualSave(draft || null);
//       setEditing(false);
//     } catch (e) {
//       setErr(e?.response?.data?.detail || e?.message || "Nepavyko išsaugoti");
//     }
//   };

//   // дефолтные label/equal
//   const _getOptionLabel = useMemo(
//     () =>
//       getOptionLabel ||
//       ((opt) => {
//         if (!opt) return "";
//         if (typeof opt === "string") return opt;
//         // универсальные поля (поддержит твои продукты/клиентов)
//         return (
//           opt.prekes_pavadinimas ||
//           opt.prekes_kodas ||
//           opt.prekes_barkodas ||
//           opt.pavadinimas ||
//           opt.imones_kodas ||
//           opt.pvm_kodas ||
//           opt.name ||
//           opt.code ||
//           opt.label ||
//           String(opt.id ?? "")
//         );
//       }),
//     [getOptionLabel]
//   );

//   const _isOptionEqualToValue = useMemo(
//     () =>
//       isOptionEqualToValue ||
//       ((opt, val) => {
//         if (!opt || !val) return false;
//         // пробуем сравнить общие ключи
//         return (
//           opt.id === val.id ||
//           opt.code === val.code ||
//           opt.prekes_kodas === val.prekes_kodas ||
//           opt.prekes_pavadinimas === val.prekes_pavadinimas ||
//           opt.prekes_barkodas === val.prekes_barkodas ||
//           opt.imones_kodas === val.imones_kodas ||
//           opt.pavadinimas === val.pavadinimas ||
//           opt.pvm_kodas === val.pvm_kodas
//         );
//       }),
//     [isOptionEqualToValue]
//   );

//   // попытка “сопоставить” текущий value с options
//   const valueObj = useMemo(() => {
//     if (typeof value === "object" && value) return value;
//     if (!options?.length || !value) return null;
//     return (
//       options.find(
//         (opt) =>
//           _getOptionLabel(opt)?.toLowerCase?.() ===
//           String(value).toLowerCase()
//       ) || null
//     );
//   }, [value, options, _getOptionLabel]);

//   return (
//     <Box
//       sx={{
//         display: "inline-flex",
//         alignItems: "center",
//         position: "relative",
//         "&:hover .eac-edit": {
//           opacity: disabled ? 0 : 1,
//           pointerEvents: disabled ? "none" : "auto",
//         },
//         ...sx,
//       }}
//     >
//       {!editing ? (
//         <>
//           <Typography component="span" fontWeight={700}>
//             {showVal(
//               typeof value === "object" ? _getOptionLabel(value) : value
//             )}
//           </Typography>
//           <Tooltip title={disabled ? "" : "Redaguoti"}>
//             <IconButton
//               size="small"
//               className="eac-edit"
//               onClick={startEdit}
//               sx={{ ml: 0.5, opacity: 0, transition: "opacity .15s ease" }}
//             >
//               <EditIcon fontSize="inherit" />
//             </IconButton>
//           </Tooltip>
//         </>
//       ) : (
//         <Stack direction="row" spacing={1} alignItems="center">
//           <Box
//             sx={{
//               display: "inline-flex",
//               alignItems: "flex-start",
//               gap: 1,
//               minWidth: 260,
//             }}
//           >
//             <Box>
//               <ToggleButtonGroup
//                 size="small"
//                 exclusive
//                 value={mode}
//                 onChange={(_, m) => m && setMode(m)}
//                 aria-label="edit mode"
//                 sx={{ mb: 0.5 }}
//               >
//                 <ToggleButton value="search" aria-label="search">
//                   <SearchIcon fontSize="small" />
//                 </ToggleButton>
//                 <ToggleButton value="manual" aria-label="manual">
//                   <KeyboardIcon fontSize="small" />
//                 </ToggleButton>
//               </ToggleButtonGroup>

//               {mode === "search" ? (
//                 <Autocomplete
//                   options={options}
//                   loading={loading}
//                   value={valueObj}
//                   getOptionLabel={_getOptionLabel}
//                   isOptionEqualToValue={_isOptionEqualToValue}
//                   onOpen={() => {
//                     if (!loadedRef.current) doFetch();
//                   }}
//                   onInputChange={(_, inputValue, reason) => {
//                     if (reason === "input") {
//                       doFetch(inputValue || "");
//                     }
//                   }}
//                   onChange={async (_, val) => {
//                     if (!val) return; // очищение здесь не поддерживаем — есть отдельная кнопка очистки снаружи, если нужно
//                     try {
//                       setErr("");
//                       await onSelect?.(val);
//                       setEditing(false);
//                     } catch (e) {
//                       setErr(
//                         e?.response?.data?.detail ||
//                           e?.message ||
//                           "Nepavyko išsaugoti"
//                       );
//                     }
//                   }}
//                   renderInput={(params) => (
//                     <TextField
//                       {...params}
//                       variant="standard"
//                       placeholder={label}
//                       InputProps={{
//                         ...params.InputProps,
//                         endAdornment: (
//                           <>
//                             {loading ? (
//                               <CircularProgress size={18} />
//                             ) : null}
//                             {params.InputProps.endAdornment}
//                           </>
//                         ),
//                       }}
//                       onKeyDown={(e) => {
//                         if (e.key === "Escape") {
//                           e.stopPropagation();
//                           cancel();
//                         }
//                       }}
//                       inputRef={inputRef}
//                       sx={{
//                         minWidth: 260,
//                         "& input": { fontWeight: 700, px: 0.5 },
//                       }}
//                     />
//                   )}
//                 />
//               ) : (
//                 <TextField
//                   inputRef={inputRef}
//                   variant="standard"
//                   size="small"
//                   placeholder={label}
//                   value={draft}
//                   onChange={(e) => setDraft(e.target.value)}
//                   onKeyDown={(e) => {
//                     if (e.key === "Escape") return cancel();
//                     if (e.key === "Enter") return commitManual();
//                   }}
//                   sx={{
//                     minWidth: 260,
//                     "& input": { fontWeight: 700, px: 0.5 },
//                   }}
//                 />
//               )}
//               {!!err && (
//                 <Typography
//                   component="div"
//                   color="error"
//                   sx={{ mt: 0.5, fontSize: 12 }}
//                 >
//                   {err}
//                 </Typography>
//               )}
//             </Box>

//             {/* actions */}
//             <Box sx={{ pt: 3.5 }}>
//               <IconButton
//                 size="small"
//                 onMouseDown={(e) => e.preventDefault()}
//                 onClick={mode === "manual" ? commitManual : cancel}
//                 sx={{ mr: 0.25 }}
//               >
//                 {mode === "manual" ? (
//                   <CheckIcon fontSize="inherit" />
//                 ) : (
//                   <CloseIcon fontSize="inherit" />
//                 )}
//               </IconButton>
//               <IconButton
//                 size="small"
//                 onMouseDown={(e) => e.preventDefault()}
//                 onClick={cancel}
//               >
//                 <CloseIcon fontSize="inherit" />
//               </IconButton>
//             </Box>
//           </Box>
//         </Stack>
//       )}
//     </Box>
//   );
// }
