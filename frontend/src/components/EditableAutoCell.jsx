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
    // Blur to dismiss keyboard on mobile
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const commitManual = async () => {
    if (!onManualSave) return cancel();
    try {
      setLoading(true);
      await onManualSave(draft || null);
      setMode("display");
      // Blur to dismiss keyboard on mobile
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    // Сразу очищаем без подтверждений
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
            setSearchOpen(false);
            // Если закрыли не через выбор опции - возвращаемся в display
            if (reason !== "selectOption") {
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
            // Blur active element to dismiss keyboard on mobile
            setTimeout(() => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            }, 0);
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







// // EditableAutoCell.jsx
// import React, { useState, useRef, useEffect } from "react";
// import {
//   Box, Typography, IconButton, TextField, CircularProgress, Tooltip, Autocomplete,
// } from "@mui/material";
// import EditIcon from "@mui/icons-material/Edit";
// import SearchIcon from "@mui/icons-material/Search";
// import DeleteIcon from "@mui/icons-material/Delete";
// import CheckIcon from "@mui/icons-material/Check";
// import CloseIcon from "@mui/icons-material/Close";
// import { api } from "../api/endpoints";

// export default function EditableAutoCell({
//   fieldName,                 // 'prekes_*' или 'buyer_*' / 'seller_*'
//   label = "Pasirinkite…",
//   value,
//   searchUrl,
//   onSelect,                  // (obj) => void
//   onManualSave,              // (text|null) => Promise<void>
//   onClear,                   // () => Promise<void> | void
//   sx,
// }) {
//   const rootRef = useRef(null);

//   const [mode, setMode] = useState("display"); // 'display' | 'edit' | 'search'
//   const [draft, setDraft] = useState(value || "");
//   const [loading, setLoading] = useState(false);

//   const [options, setOptions] = useState([]);
//   const [inputValue, setInputValue] = useState("");
//   const [searchOpen, setSearchOpen] = useState(false);
//   const openedOnceRef = useRef(false);

//   // защита от гонок + дебаунс
//   const lastReqIdRef = useRef(0);
//   const debounceTimerRef = useRef(null);

//   useEffect(() => {
//     if (mode === "display") setDraft(value || "");
//   }, [value, mode]);

//   // клик-вне (закрывает edit/search)
//   useEffect(() => {
//     const onDocDown = (e) => {
//       if (mode === "display") return;
//       if (!rootRef.current) return;
//       if (!rootRef.current.contains(e.target)) {
//         setMode("display");
//         setSearchOpen(false);
//       }
//     };
//     document.addEventListener("mousedown", onDocDown);
//     return () => document.removeEventListener("mousedown", onDocDown);
//   }, [mode]);

//   // Маппинг ключей запроса для разных полей
//   const qKeyByField = {
//     // продукты
//     prekes_pavadinimas: "q",
//     prekes_kodas: "code",
//     prekes_barkodas: "barcode",
//     // клиенты
//     buyer_name: "q",
//     seller_name: "q",
//     buyer_id: "code",
//     seller_id: "code",
//     buyer_vat_code: "vat",
//     seller_vat_code: "vat",
//   };
//   const qKey = qKeyByField[fieldName] || "q";

//   const isClientField = fieldName?.startsWith("buyer_") || fieldName?.startsWith("seller_");
//   const isIdField   = fieldName === "buyer_id" || fieldName === "seller_id";
//   const isVatField  = fieldName === "buyer_vat_code" || fieldName === "seller_vat_code";

//   // нормализация ввода под конкретные поля
//   const normalizeForQuery = (raw) => {
//     let s = String(raw || "");
//     if (isIdField)  return s.replace(/\D+/g, "");                         // только цифры
//     if (isVatField) return s.toUpperCase().replace(/[\s-]+/g, "");        // LT************
//     return s.trim();
//   };

//   // теперь ищем с первого символа (и разрешаем пустую строку для стартового списка)
//   const minLengthOK = (norm) => norm.length >= 1 || norm.length === 0;

//   const getOptionLabel = (opt) => {
//     if (!opt) return "";

//     // для клиентов (buyer/seller)
//     if (fieldName === "buyer_name" || fieldName === "seller_name")
//       return opt.pavadinimas || opt.name || "";
//     if (fieldName === "buyer_id" || fieldName === "seller_id")
//       return opt.imones_kodas || opt.code || "";
//     if (fieldName === "buyer_vat_code" || fieldName === "seller_vat_code")
//       return opt.pvm_kodas || opt.vat || "";

//     // для продуктов
//     if (fieldName === "prekes_kodas") return opt.prekes_kodas || opt.code || "";
//     if (fieldName === "prekes_barkodas") return opt.prekes_barkodas || opt.barkodas || opt.barcode || "";
//     return opt.prekes_pavadinimas || opt.pavadinimas || opt.name || "";
//   };

//   const fetchOptions = async (text = "") => {
//     if (!searchUrl) return;
//     const myReqId = ++lastReqIdRef.current;
//     setLoading(true);
//     try {
//       const norm = normalizeForQuery(text);

//       if (!minLengthOK(norm)) {
//         if (myReqId === lastReqIdRef.current) {
//           setOptions([]);
//           setLoading(false);
//         }
//         return;
//       }

//       const params = norm ? { [qKey]: norm, q: norm } : {}; // пустой запрос -> «все»/первая страница
//       const { data } = await api.get(searchUrl, { params, withCredentials: true });

//       if (myReqId !== lastReqIdRef.current) return;
//       const arr = Array.isArray(data) ? data : (data.results || []);
//       setOptions(arr);
//       openedOnceRef.current = true;
//     } catch {
//       if (myReqId === lastReqIdRef.current) setOptions([]);
//     } finally {
//       if (myReqId === lastReqIdRef.current) setLoading(false);
//     }
//   };

//   const startEdit = () => {
//     setDraft(value || "");
//     setMode("edit");
//   };

//   const startSearch = () => {
//     setMode("search");
//     setInputValue("");
//     setSearchOpen(true);
//     // сразу фетчим стартовый список, чтобы не видеть "no options"
//     fetchOptions("");
//   };

//   const cancel = () => {
//     setMode("display");
//     setSearchOpen(false);
//     setDraft(value || "");
//   };

//   const commitManual = async () => {
//     if (!onManualSave) return cancel();
//     try {
//       setLoading(true);
//       await onManualSave(draft || null);
//       setMode("display");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleClear = async () => {
//     if (onClear) await onClear();
//   };

//   // дебаунс поиска
//   useEffect(() => {
//     if (mode !== "search") return;
//     if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
//     debounceTimerRef.current = setTimeout(() => {
//       fetchOptions(inputValue);
//     }, 250);
//     return () => {
//       if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [inputValue, mode]);

//   return (
//     <Box
//       ref={rootRef}
//       sx={{
//         display: "inline-flex",
//         alignItems: "center",
//         gap: 0.5,
//         minHeight: 28,
//         position: "relative",
//         "&:hover .ea-actions": { opacity: 1, pointerEvents: "auto" },
//         ...sx,
//       }}
//     >
//       {/* DISPLAY */}
//       {mode === "display" && (
//         <>
//           <Typography component="span" sx={{ fontWeight: 700, lineHeight: "28px" }}>
//             {value || "—"}
//           </Typography>

//           <Box
//             className="ea-actions"
//             sx={{
//               display: "inline-flex",
//               gap: 0.25,
//               opacity: 0,
//               transition: "opacity .15s",
//               ml: 0.25,
//             }}
//           >
//             <Tooltip title="Ieškoti">
//               <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={startSearch} sx={{ p: 0.5 }}>
//                 <SearchIcon fontSize="inherit" />
//               </IconButton>
//             </Tooltip>

//             <Tooltip title="Redaguoti">
//               <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={startEdit} sx={{ p: 0.5 }}>
//                 <EditIcon fontSize="inherit" />
//               </IconButton>
//             </Tooltip>

//             <Tooltip title="Ištrinti">
//               <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={handleClear} sx={{ p: 0.5 }}>
//                 <DeleteIcon fontSize="inherit" />
//               </IconButton>
//             </Tooltip>
//           </Box>
//         </>
//       )}

//       {/* EDIT */}
//       {mode === "edit" && (
//         <>
//           <TextField
//             autoFocus
//             value={draft}
//             onChange={(e) => setDraft(e.target.value)}
//             size="small"
//             variant="standard"
//             placeholder={label}
//             onKeyDown={(e) => {
//               if (e.key === "Enter") commitManual();
//               if (e.key === "Escape") cancel();
//             }}
//             sx={{ minWidth: 240, "& input": { fontWeight: 700, px: 0.5 } }}
//           />
//           {loading ? (
//             <CircularProgress size={18} />
//           ) : (
//             <>
//               <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={commitManual} sx={{ p: 0.5 }}>
//                 <CheckIcon fontSize="inherit" />
//               </IconButton>
//               <IconButton size="small" onMouseDown={(e)=>e.preventDefault()} onClick={cancel} sx={{ p: 0.5 }}>
//                 <CloseIcon fontSize="inherit" />
//               </IconButton>
//             </>
//           )}
//         </>
//       )}

//       {/* SEARCH */}
//       {mode === "search" && (
//         <Autocomplete
//           disablePortal
//           sx={{ minWidth: 360 }}
//           options={options}
//           loading={loading}
//           value={null}
//           open={searchOpen}
//           noOptionsText={loading ? "" : "—"}  // не показываем "no options" во время первого запроса
//           onOpen={() => {
//             setSearchOpen(true);
//             if (!openedOnceRef.current) fetchOptions("");
//           }}
//           onClose={(_, reason) => {
//             if (reason !== "selectOption") {
//               setSearchOpen(false);
//               setMode("display");
//             }
//           }}
//           inputValue={inputValue}
//           onInputChange={(_, val) => setInputValue(val)}
//           onChange={(_, newVal) => {
//             if (!newVal) return;
//             onSelect && onSelect(newVal);
//             setSearchOpen(false);
//             setMode("display");
//           }}
//           filterOptions={(x) => x}
//           getOptionLabel={getOptionLabel}
//           isOptionEqualToValue={(o, v) => getOptionLabel(o) === getOptionLabel(v)}
//           autoHighlight
//           includeInputInList
//           renderInput={(params) => (
//             <TextField
//               {...params}
//               autoFocus
//               placeholder={label}
//               variant="standard"
//               size="small"
//               InputProps={{
//                 ...params.InputProps,
//                 endAdornment: (
//                   <>
//                     {loading ? <CircularProgress size={16} /> : null}
//                     {params.InputProps.endAdornment}
//                   </>
//                 ),
//               }}
//               onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
//             />
//           )}
//           renderOption={(props, option) => {
//             const isClient =
//               isClientField || "imones_kodas" in option || "pvm_kodas" in option;

//             if (isClient) {
//               const title = option.pavadinimas || option.name || "—";
//               const code  = option.imones_kodas || option.code || "";
//               const vat   = option.pvm_kodas || option.vat || "";
//               const subtitle = [code && `įmonės kodas: ${code}`, vat && `PVM: ${vat}`]
//                 .filter(Boolean)
//                 .join(" • ");

//               return (
//                 <li {...props} key={`${code}-${vat}-${title}`}>
//                   <Box sx={{ display: "flex", flexDirection: "column" }}>
//                     <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
//                     {subtitle && (
//                       <Typography variant="caption" color="text.secondary">
//                         {subtitle}
//                       </Typography>
//                     )}
//                   </Box>
//                 </li>
//               );
//             }

//             const name = option.prekes_pavadinimas || option.pavadinimas || option.name || "";
//             const code = option.prekes_kodas || option.code || "";
//             const bark = option.prekes_barkodas || option.barkodas || option.barcode || "";
//             return (
//               <li {...props} key={`${code}-${bark}-${name}`}>
//                 <Box sx={{ display:"flex", flexDirection:"column" }}>
//                   <Typography sx={{ fontWeight: 600 }}>{name || "—"}</Typography>
//                   <Typography variant="caption" color="text.secondary">
//                     {code ? `kodas: ${code}` : ""}{code && bark ? " • " : ""}{bark ? `barkodas: ${bark}` : ""}
//                   </Typography>
//                 </Box>
//               </li>
//             );
//           }}
//         />
//       )}
//     </Box>
//   );
// }

