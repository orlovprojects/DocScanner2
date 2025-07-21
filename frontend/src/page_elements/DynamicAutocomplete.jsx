import { useState, useRef } from "react";
import {
  Autocomplete,
  TextField,
  CircularProgress,
  IconButton,
  InputAdornment,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { api } from "../api/endpoints";
import InputBase from '@mui/material/InputBase';

/**
 * Универсальный Autocomplete с динамической подгрузкой опций.
 * Props:
 * - field: объект из EXTRA_FIELDS_CONFIG (name, label, search, type)
 * - selectedValue: текущий выбранный объект (или null)
 * - onSelect: функция(obj) — что делать при выборе значения (передаёт весь объект)
 * - onClear: функция() — что делать при очистке
 */
export default function DynamicAutocomplete({
  field,
  selectedValue,
  onSelect,
  onClear,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  // Универсальная загрузка опций с поддержкой поиска
  const fetchOptions = async (searchText = "") => {
    if (!field?.search) return;
    setLoading(true);
    try {
      const params = searchText ? { q: searchText } : {};
      const { data } = await api.get(field.search, { params, withCredentials: true });
      setOptions(Array.isArray(data) ? data : (data.results || []));
      loaded.current = true;
    } catch (e) {
      setOptions([]);
      // eslint-disable-next-line
      console.warn("Ошибка загрузки вариантов для", field.name, e);
    } finally {
      setLoading(false);
    }
  };

  // Найти value-объект по текущему value (selectedValue)
  const valueObj =
    typeof selectedValue === "object"
      ? selectedValue
      : options.find(
          (opt) =>
            // Для продуктов
            opt.prekes_pavadinimas === selectedValue ||
            opt.prekes_kodas === selectedValue ||
            opt.prekes_barkodas === selectedValue ||
            // Для клиентов
            opt.imones_kodas === selectedValue ||
            opt.pavadinimas === selectedValue ||
            opt.pvm_kodas === selectedValue ||
            opt.code === selectedValue ||
            String(opt.id) === String(selectedValue)
        ) || null;

  // Текст для отображения в зависимости от поля
  const getOptionLabel = (option) => {
    if (!option) return "";
    if (typeof option === "string") return option;

    // Для продуктов (prekės)
    if (field.name === "prekes_pavadinimas") return option.prekes_pavadinimas || option.name || "";
    if (field.name === "prekes_kodas") return option.prekes_kodas || option.code || "";
    if (field.name === "prekes_barkodas") return option.prekes_barkodas || option.barkodas || option.barcode || "";

    // Для клиентов (имя/код/пдв)
    if (field.name === "buyer_name" || field.name === "seller_name") return option.pavadinimas || option.name || "";
    if (field.name === "buyer_id" || field.name === "seller_id") return option.imones_kodas || option.code || option.id?.toString() || "";
    if (field.name === "buyer_vat_code" || field.name === "seller_vat_code") return option.pvm_kodas || "";

    // fallback (универсально)
    return (
      option.prekes_pavadinimas ||
      option.prekes_kodas ||
      option.prekes_barkodas ||
      option.pavadinimas ||
      option.imones_kodas ||
      option.pvm_kodas ||
      option.name ||
      option.code ||
      option.label ||
      option.id?.toString() ||
      ""
    );
  };
  // const getOptionLabel = (option) => {
  //   if (!option) return "";
  //   if (typeof option === "string") return option;
  //   if (field.name.endsWith("name") || field.name.includes("pavadinimas")) return option.pavadinimas || option.name || "";
  //   if (field.name.endsWith("id") || field.name.includes("imones_kodas")) return option.imones_kodas || option.code || option.id?.toString() || "";
  //   if (field.name.includes("vat") || field.name.includes("pvm")) return option.pvm_kodas || "";
  //   // fallback
  //   return (
  //     option.pavadinimas ||
  //     option.imones_kodas ||
  //     option.pvm_kodas ||
  //     option.name ||
  //     option.code ||
  //     option.label ||
  //     option.id?.toString() ||
  //     ""
  //   );
  // };

  // Для очистки показываем только мусорку
  const showClear = typeof onClear === "function" && valueObj;

  return (
    <Autocomplete
      sx={{
        mb: 2,
        width: "100%",
        minWidth: 260,
        ".MuiInputBase-root": { fontSize: 20, fontWeight: 500 },
      }}
      options={options}
      value={valueObj}
      loading={loading}
      getOptionLabel={getOptionLabel}
      isOptionEqualToValue={(option, value) =>
        (!!option && !!value) && (
          // Для продуктов
          option.prekes_kodas === value.prekes_kodas ||
          option.prekes_pavadinimas === value.prekes_pavadinimas ||
          option.prekes_barkodas === value.prekes_barkodas ||
          // Для клиентов
          option.imones_kodas === value.imones_kodas ||
          option.pavadinimas === value.pavadinimas ||
          option.pvm_kodas === value.pvm_kodas ||
          option.id === value.id ||
          option.code === value.code
        )
      }
      onOpen={() => {
        if (!loaded.current) fetchOptions();
      }}
      onInputChange={(_, inputValue, reason) => {
        if (reason === "input" && inputValue.length > 0) {
          fetchOptions(inputValue);
        }
      }}
      onChange={(_, value) => {
        if (!value) {
          if (onClear) onClear();
          return;
        }
        // Всегда возвращаем полный объект!
        onSelect && onSelect(value);
      }}
      renderInput={(params) => (
            <InputBase
              {...params.InputProps}
              inputProps={{
                ...params.inputProps,
                style: {
                  padding: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  height: 22,
                },
                autoComplete: 'off', // disable browser autocomplete
              }}
              placeholder={field.label}
              endAdornment={
                <>
                  {loading ? <CircularProgress color="inherit" size={18} /> : null}
                  {params.InputProps?.endAdornment}
                </>
              }
              sx={{
                fontSize: 16,
                fontWeight: 400,
                minHeight: "16px",
                height: "16px",
                border: "none",
                borderRadius: 0,
                background: "none",
                boxShadow: "none",
                px: 0,
                "& input::placeholder": {
                  fontWeight: 100,    // <-- жирность плейсхолдера!
                  color: "#b0b0b0",   // можно подобрать любой оттенок
                  opacity: 1,
                },
              }}
              fullWidth
            />

      )}
      freeSolo={false}
    />
  );
}





// import { useState, useRef } from "react";
// import {
//   Autocomplete,
//   TextField,
//   CircularProgress,
//   IconButton,
//   InputAdornment,
// } from "@mui/material";
// import DeleteIcon from "@mui/icons-material/Delete";
// import { api } from "../api/endpoints";

// /**
//  * Универсальный Autocomplete с динамической подгрузкой опций, поддержкой
//  * - field: объект из EXTRA_FIELDS_CONFIG (name, label, search, type)
//  * - selectedValue: текущее значение (string или object)
//  * - onSelect: функция(value) — что делать при выборе одной опции
//  * - onMultiSelect: ({mainField, mainValue, relatedField, valueObj}) — для связанных полей (код/название)
//  * - onClear: функция() — если нужна очистка по мусорке (например, сбросить оба поля)
//  * - relatedField: имя второго поля, если это пара (например, для код/название товара)
//  */
// export default function DynamicAutocomplete({
//   field,
//   selectedValue,
//   onSelect,
//   onMultiSelect,
//   onClear,
//   relatedField,
//   selectedRelatedValue,
// }) {
//   const [options, setOptions] = useState([]);
//   const [loading, setLoading] = useState(false);
//   const loaded = useRef(false);

//   // Загружает варианты (поиск, если нужно)
//   const fetchOptions = async (searchText = "") => {
//     if (!field?.search) return;
//     setLoading(true);
//     try {
//       const params = searchText ? { q: searchText } : {};
//       const { data } = await api.get(field.search, { params, withCredentials: true });
//       setOptions(data.results || data || []);
//       loaded.current = true;
//     } catch (e) {
//       setOptions([]);
//       // eslint-disable-next-line
//       console.warn("Ошибка загрузки вариантов для", field.name, e);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Найти value-объект в options по текущему value (selectedValue)
//   const valueObj =
//     typeof selectedValue === "object"
//       ? selectedValue
//       : options.find(
//           (opt) =>
//             opt.code === selectedValue ||
//             opt.name === selectedValue ||
//             String(opt.id) === String(selectedValue)
//         ) || null;

//   // Поддержка мусорки: показываем только если есть selectedValue
//   const showClear =
//     typeof onClear === "function" &&
//     (selectedValue || selectedRelatedValue);

//   return (
//     <Autocomplete
//       options={options}
//       value={valueObj}
//       loading={loading}
//       getOptionLabel={(option) => {
//         if (!option) return "";
//         if (typeof option === "string") return option;
//         // Для "код" — code, для "название" — name
//         if (field.name.endsWith("kodas")) return option.code || "";
//         if (field.name.endsWith("pavadinimas")) return option.name || "";
//         return option.name || option.code || option.label || option.id?.toString() || "";
//       }}
//       isOptionEqualToValue={(option, value) =>
//         (option?.id && value?.id && option.id === value.id) ||
//         (option?.code && value?.code && option.code === value.code) ||
//         (option?.name && value?.name && option.name === value.name) ||
//         option === value
//       }
//       onOpen={() => {
//         if (!loaded.current) fetchOptions();
//       }}
//       onInputChange={(_, inputValue, reason) => {
//         if (reason === "input" && inputValue.length > 0) {
//           fetchOptions(inputValue);
//         }
//       }}
//       onChange={(_, value) => {
//         if (!value) {
//           if (onClear) onClear();
//           return;
//         }
//         // --- Для пар "код/название": вызываем onMultiSelect
//         if (onMultiSelect && relatedField) {
//           // Если это код — подставить и название, и наоборот
//           if (field.name.endsWith("kodas")) {
//             onMultiSelect({
//               mainField: field.name,
//               mainValue: value.code,
//               relatedField: relatedField,
//               relatedValue: value.name,
//               valueObj: value,
//             });
//           } else if (field.name.endsWith("pavadinimas")) {
//             onMultiSelect({
//               mainField: field.name,
//               mainValue: value.name,
//               relatedField: relatedField,
//               relatedValue: value.code,
//               valueObj: value,
//             });
//           } else {
//             onSelect && onSelect(value);
//           }
//         } else {
//           onSelect && onSelect(value);
//         }
//       }}
//       renderInput={(params) => (
//         <TextField
//           {...params}
//           label={field.label}
//           sx={{ mb: 2, width: "100%" }}
//           size="small"
//           InputProps={{
//             ...params.InputProps,
//             endAdornment: (
//               <>
//                 {showClear && (
//                   <InputAdornment position="end">
//                     <IconButton
//                       size="small"
//                       edge="end"
//                       aria-label="clear"
//                       onClick={onClear}
//                       tabIndex={-1}
//                     >
//                       <DeleteIcon fontSize="small" />
//                     </IconButton>
//                   </InputAdornment>
//                 )}
//                 {loading ? <CircularProgress color="inherit" size={16} /> : null}
//                 {params.InputProps.endAdornment}
//               </>
//             ),
//           }}
//         />
//       )}
//       freeSolo={false}
//     />
//   );
// }

