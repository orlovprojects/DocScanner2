import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/lt';
import React from 'react';
import SwapBuyerSellerButton from './SwapBuyerSellerButton';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Divider,
  Accordion, AccordionSummary, AccordionDetails,
  Stack,
  Grid2,
  Paper,
  Tooltip,
  Button,
  Chip,
  CircularProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ZoomableImage from "../pages/ZoomableImage";
import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";
import { api } from "../api/endpoints";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import EditableCell from "../components/EditableCell";
import EditableAutoCell from "../components/EditableAutoCell";


const LINE_ITEMS_LIMIT = 30;

// Стили для поля с ошибкой (для EditableCell через sx)
const errorFieldSx = {
  border: '1.5px solid #d32f2f',
  borderRadius: '4px',
  boxShadow: '0 0 4px 1px rgba(211, 47, 47, 0.25)',
  px: 0.5,
};

// Стили для accordion с ошибками
const accordionErrorSx = {
  border: '1.5px solid #d32f2f',
  boxShadow: '0 0 6px 2px rgba(211, 47, 47, 0.3)',
  '& .MuiAccordionSummary-root': {
    backgroundColor: 'rgba(211, 47, 47, 0.08)',
  },
};

// Проверка заполненности поля
const isFieldFilled = (value, allowZero = true) => {
  if (value === null || value === undefined) return false;
  
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return false;
    
    // Для числовых полей с allowZero=false - проверяем не равно ли нулю
    if (!allowZero) {
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num === 0) return false;
    }
    return true;
  }
  
  if (typeof value === 'number') {
    if (!allowZero && value === 0) return false;
    return true;
  }
  
  return Boolean(value);
};

// Получить Set незаполненных обязательных полей документа
const getMissingDocFields = (doc) => {
  if (!doc) return new Set();
  
  const missing = new Set();
  
  // Поля которые могут быть 0
  const canBeZero = ['seller_name', 'buyer_name', 'invoice_date', 'currency', 'document_number', 'vat_amount'];
  
  // vat_percent обязателен только если separate_vat=false
  if (!doc.separate_vat) {
    canBeZero.push('vat_percent');
  }
  
  // Поля которые НЕ могут быть 0
  const cannotBeZero = ['amount_wo_vat', 'amount_with_vat'];
  
  for (const field of canBeZero) {
    if (!isFieldFilled(doc[field], true)) missing.add(field);
  }
  
  for (const field of cannotBeZero) {
    if (!isFieldFilled(doc[field], false)) missing.add(field);
  }
  
  return missing;
};

// Получить Set незаполненных обязательных полей line item
const getMissingLineFields = (line) => {
  if (!line) return new Set();
  
  const missing = new Set();
  
  // Могут быть 0
  const canBeZero = ['price', 'quantity', 'vat'];
  // НЕ могут быть 0
  const cannotBeZero = ['subtotal', 'total'];
  
  for (const field of canBeZero) {
    if (!isFieldFilled(line[field], true)) missing.add(field);
  }
  
  for (const field of cannotBeZero) {
    if (!isFieldFilled(line[field], false)) missing.add(field);
  }
  
  return missing;
};

// Проверить есть ли ошибки хотя бы в одном line item
const hasAnyLineItemErrors = (lineItems) => {
  if (!lineItems || lineItems.length === 0) return false;
  return lineItems.some(line => getMissingLineFields(line).size > 0);
};

const mapVatStatus = (status) => {
  switch (status) {
    case "valid":
      return {
        label: "PVM galioja",
        color: "success",
        icon: <CheckCircleIcon />,
      };
    case "invalid":
      return {
        label: "PVM negalioja",
        color: "error",
        icon: <ErrorIcon />,
      };
    default:
      return null;
  }
};

const ltEilutes = (n) => {
  const num = Math.abs(Number(n) || 0);
  const last2 = num % 100;
  const last1 = num % 10;

  if (last2 >= 11 && last2 <= 19) return "eilučių"; // 11–19 
  if (last1 === 1) return "eilutė";                 // 1, 21, 31...
  if (last1 >= 2 && last1 <= 9) return "eilutės";   // 2–9, 22–29...
  return "eilučių";                                 // 0, 10, 20, 30...
};

const LineItemCard = React.memo(({ 
  item, 
  index,
  canDelete,
  previewLinePvm,
  onDelete,
  onProductSelect,
  onProductClear,
  onSaveFields,
  formatNumberPreview,
  PRODUCT_FIELDS,
  EXTRA_FIELDS_CONFIG,
  showErrors,
}) => {
  // Вычисляем missing fields для этой строки
  const missingFields = useMemo(() => {
    if (!showErrors) return new Set();
    return getMissingLineFields(item);
  }, [showErrors, item?.price, item?.quantity, item?.subtotal, item?.vat, item?.total]);

  const getFieldErrorSx = (fieldName) => {
    return (showErrors && missingFields.has(fieldName)) ? errorFieldSx : {};
  };

  return (
    <Box
      sx={{
        mb: 2,
        p: 2,
        border: "1px solid #eee",
        borderRadius: 2,
        background: "#fff",
        position: "relative",
      }}
    >
      <Tooltip title={canDelete ? "Ištrinti eilutę" : "Negalima ištrinti vienintelės eilutės"}>
        <IconButton
          size="small"
          onClick={() => canDelete && onDelete(item.id)}
          disabled={!canDelete}
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            color: "text.secondary",
            "&:hover": canDelete ? { color: "error.main" } : undefined,
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Typography
        sx={{
          fontWeight: 100,
          marginBottom: 3,
          fontStyle: "italic",
        }}
      >
        {`Prekė #${index + 1}`}
      </Typography>

      {PRODUCT_FIELDS.map(({ field, label }) => {
        const cfg = EXTRA_FIELDS_CONFIG.product.find(f => f.name === field);
        return (
          <Stack
            key={`${item.id}-${field}`}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Typography color="text.secondary" sx={{ minWidth: 130, color: "black" }}>
              {label}
            </Typography>

            <EditableAutoCell
              label={cfg?.label || "Pasirinkite…"}
              value={item[field] || ""}
              searchUrl={cfg?.search}
              onSelect={onProductSelect(item.id)}
              onManualSave={(text) => onSaveFields(item.id, { [field]: text || null })}
              onClear={onProductClear(item.id)}
              sx={{
                flex: 1,
                "& .MuiInputBase-root": {
                  minHeight: "28px",
                  background: "transparent",
                  fontSize: "14px",
                  px: 1,
                },
                "& input": { padding: 0, fontSize: "14px", fontWeight: 700 },
              }}
            />
          </Stack>
        );
      })}

      <Stack spacing={0.5} mt={1} mb={1}>
        <Typography>Mato vnt: <EditableCell value={item.unit} onSave={(v) => onSaveFields(item.id, "unit", v)} /></Typography>
        <Typography>Kiekis: <EditableCell value={item.quantity} inputType="number" onSave={(v) => onSaveFields(item.id, "quantity", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} sx={getFieldErrorSx('quantity')} /></Typography>
        <Typography>Kaina: <EditableCell value={item.price} inputType="number" onSave={(v) => onSaveFields(item.id, "price", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} sx={getFieldErrorSx('price')} /></Typography>
        <Typography>Suma (be PVM): <EditableCell value={item.subtotal} inputType="number" onSave={(v) => onSaveFields(item.id, "subtotal", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} sx={getFieldErrorSx('subtotal')} /></Typography>
        <Typography>PVM: <EditableCell value={item.vat} inputType="number" onSave={(v) => onSaveFields(item.id, "vat", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} sx={getFieldErrorSx('vat')} /></Typography>
        <Typography>PVM %: <EditableCell value={item.vat_percent} inputType="number" onSave={(v) => onSaveFields(item.id, "vat_percent", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
        <Typography>PVM klasė: <b>{previewLinePvm}</b></Typography>
        <Typography>Suma (su PVM): <EditableCell value={item.total} inputType="number" onSave={(v) => onSaveFields(item.id, "total", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} sx={getFieldErrorSx('total')} /></Typography>
        <Typography>Nuolaida (be PVM): <b>{formatNumberPreview(item.discount_wo_vat)}</b></Typography>
        <Typography>Nuolaida (su PVM): <b>{formatNumberPreview(item.discount_with_vat)}</b></Typography>
      </Stack>
    </Box>
  );
});


export default function PreviewDialog({
  open,
  onClose,
  selected,
  setSelected,
  setDocs,
  user,
  selectedCpKey,
  showRawPanels = false,
}) {
  const prevDocId = useRef();
  const isMulti = user?.view_mode === "multi";

  const sameId = (a, b) => String(a) === String(b);

  const [localPreview, setLocalPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const lastReqIdRef = useRef(0);
  const abortRef = useRef(null);

  // Line items lazy loading state
  const [lineItemsLoaded, setLineItemsLoaded] = useState([]);
  const [lineItemsOffset, setLineItemsOffset] = useState(0);
  const [lineItemsTotal, setLineItemsTotal] = useState(0);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);
  const [lineItemsLoadingMore, setLineItemsLoadingMore] = useState(false);
  const [accordionExpanded, setAccordionExpanded] = useState(false);
  const lineItemsContainerRef = useRef(null);

  // Closing state для мгновенного закрытия
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  const lineItemsReqLockRef = useRef(false);

  useEffect(() => {
    closingRef.current = closing;
  }, [closing]);

  // Вычисляем missing fields документа (memoized)
  const missingDocFields = useMemo(() => {
    if (selected?.ready_for_export !== false) return new Set();
    return getMissingDocFields(selected);
  }, [
    selected?.ready_for_export,
    selected?.seller_name,
    selected?.buyer_name,
    selected?.invoice_date,
    selected?.currency,
    selected?.document_number,
    selected?.vat_amount,
    selected?.vat_percent,
    selected?.amount_wo_vat,
    selected?.amount_with_vat,
    selected?.separate_vat,
  ]);

  // Проверяем есть ли ошибки в line items (для подсветки accordion)
  const lineItemsHaveErrors = useMemo(() => {
    if (selected?.ready_for_export !== false) return false;
    // Если документ не готов к экспорту и нет ошибок в основных полях,
    // но line items ещё не загружены - считаем что там могут быть ошибки
    if (missingDocFields.size === 0 && lineItemsLoaded.length === 0 && selected?.scan_type === 'detaliai') {
      return true; // предполагаем что ошибки в line items
    }
    return hasAnyLineItemErrors(lineItemsLoaded);
  }, [selected?.ready_for_export, selected?.scan_type, missingDocFields.size, lineItemsLoaded]);

  // Показывать ли ошибки (только когда ready_for_export === false)
  const showFieldErrors = selected?.ready_for_export === false;

  // Хелпер для получения sx с ошибкой для полей документа
  const getDocFieldErrorSx = useCallback((fieldName) => {
    return (showFieldErrors && missingDocFields.has(fieldName)) ? errorFieldSx : {};
  }, [showFieldErrors, missingDocFields]);

  // DEBUG: логируем состояние ошибок
  useEffect(() => {
    if (selected?.id) {
      console.log('[PreviewDialog] Error state:', {
        ready_for_export: selected?.ready_for_export,
        showFieldErrors,
        missingDocFields: Array.from(missingDocFields),
        lineItemsHaveErrors,
        buyer_name: selected?.buyer_name,
        vat_percent: selected?.vat_percent,
        separate_vat: selected?.separate_vat,
      });
    }
  }, [selected?.id, selected?.ready_for_export, showFieldErrors, missingDocFields, lineItemsHaveErrors]);

  const mkKey = (id, vat, name) => {
    const idStr = id == null ? "" : String(id).trim();
    if (idStr) return `id:${idStr}`;
    const normVat  = (vat  || "").trim().toLowerCase();
    const normName = (name || "").trim().toLowerCase();
    return normVat || normName;
  };

  const optimisticDirection = useMemo(() => {
    if (!isMulti || !selected) return null;
    if (!selectedCpKey) return null;
    const sKey = mkKey(selected.seller_id, selected.seller_vat_code, selected.seller_name);
    const bKey = mkKey(selected.buyer_id,  selected.buyer_vat_code,  selected.buyer_name);
    if (selectedCpKey === sKey && sKey) return "pardavimas";
    if (selectedCpKey === bKey && bKey) return "pirkimas";
    return null;
  }, [isMulti, selected, selectedCpKey]);

  const ppText = (code) =>
    code === "pirkimas" ? "Pirkimas" : code === "pardavimas" ? "Pardavimas" : "Pasirinkite kontrahentą";

  // Load line items with pagination

  const loadLineItems = useCallback(async (docId, offset = 0, append = false) => {
    if (closingRef.current) return;
    if (lineItemsReqLockRef.current) return;

    lineItemsReqLockRef.current = true;
    if (append) setLineItemsLoadingMore(true);
    else setLineItemsLoading(true);

    try {
      const res = await api.get(`/documents/${docId}/lineitems/`, {
        params: {
          limit: LINE_ITEMS_LIMIT,
          offset,
          ...(isMulti && selectedCpKey ? { cp_key: selectedCpKey } : {}),
        },
        withCredentials: true,
      });

      if (closingRef.current) return;

      const { results = [], count = 0 } = res.data || {};
      setLineItemsTotal(count);

      setLineItemsLoaded(prev => {
        const next = append ? [...prev, ...results] : results;
        const map = new Map();
        for (const x of next) map.set(String(x.id), x);
        return Array.from(map.values());
      });

      setLineItemsOffset(prev => (append ? prev + results.length : results.length));
    } catch (e) {
      console.error("Failed to load line items:", e);
    } finally {
      lineItemsReqLockRef.current = false;
      if (!closingRef.current) {
        setLineItemsLoading(false);
        setLineItemsLoadingMore(false);
      }
    }
  }, [isMulti, selectedCpKey]);

  const loadMoreLineItems = useCallback(() => {
    if (closingRef.current) return;
    if (!selected?.id) return;

    // если уже всё загрузили — стоп
    if (lineItemsOffset >= lineItemsTotal) return;

    loadLineItems(selected.id, lineItemsOffset, true);
  }, [selected?.id, lineItemsOffset, lineItemsTotal, loadLineItems]);

  const handleClose = useCallback(() => {
    // 1) моментально убираем тяжелое из DOM
    setClosing(true);
    setAccordionExpanded(false);

    // 2) прерываем запросы (если есть)
    abortRef.current?.abort();
    abortRef.current = null;

    // 3) закрываем диалог сразу
    onClose();

    // 4) тяжелые сбросы уже после закрытия (не мешают клику)
    setTimeout(() => {
      setLineItemsLoaded([]);
      setLineItemsOffset(0);
      setLineItemsTotal(0);
      setLineItemsLoading(false);
      setLocalPreview(null);
      prevDocId.current = null;

      setClosing(false);
    }, 0);
  }, [onClose]);

  const refreshDocument = async (id) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const reqId = ++lastReqIdRef.current;

    if (isMulti) {
      setPreviewLoading(true);
      setLocalPreview(prev => ({
        ...(prev || {}),
        pirkimas_pardavimas_code: optimisticDirection,
        pirkimas_pardavimas_label: ppText(optimisticDirection),
        pvm_kodas: prev?.pvm_kodas ?? null,
        pvm_kodas_label: prev?.pvm_kodas_label ?? (selectedCpKey ? "—" : "Pasirinkite kontrahentą"),
        line_items: prev?.line_items || [],
      }));
    }

    try {
      const res = await api.get(`/documents/${id}/`, {
        withCredentials: true,
        signal: controller.signal,
        params: (isMulti && selectedCpKey) ? { cp_key: selectedCpKey } : {},
      });

      if (reqId !== lastReqIdRef.current) return;

      setSelected(res.data);
      setDocs(prev => prev.map(d => sameId(d.id, id) ? res.data : d));

      // Update line items total count
      setLineItemsTotal(res.data.line_items_count || 0);

      if (isMulti) {
        if (selectedCpKey) {
          setLocalPreview(res.data.preview || null);
        } else {
          const pv = res.data.preview || {};
          setLocalPreview({
            ...pv,
            pirkimas_pardavimas_code: null,
            pirkimas_pardavimas_label: "Pasirinkite kontrahentą",
            pvm_kodas: null,
            pvm_kodas_label: "Pasirinkite kontrahentą",
            line_items: Array.isArray(pv.line_items) ? pv.line_items.map(li => ({
              ...li,
              pvm_kodas: null,
              pvm_kodas_label: "Pasirinkite kontrahentą",
            })) : [],
          });
        }
      }
    } catch (e) {
    } finally {
      if (reqId === lastReqIdRef.current) setPreviewLoading(false);
    }
  };

  useEffect(() => {
    const container = lineItemsContainerRef.current;
    if (!container || !accordionExpanded || closingRef.current) return;

    const handleScroll = () => {
      if (closingRef.current) return;
      if (lineItemsLoading) return;
      if (lineItemsLoaded.length >= lineItemsTotal) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMoreLineItems();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [
    accordionExpanded,
    loadMoreLineItems,
    lineItemsLoading,
    lineItemsLoaded.length,
    lineItemsTotal,
    selected?.id,
  ]);


  // Reset line items state when document changes
  useEffect(() => {
    if (open && selected?.id && !String(selected.id).startsWith("temp-") && prevDocId.current !== selected.id) {
      setLocalPreview(null);
      setLineItemsLoaded([]);
      setLineItemsOffset(0);
      setLineItemsTotal(0);
      setAccordionExpanded(false);
      refreshDocument(selected.id);
      prevDocId.current = selected.id;
    }
  }, [open, selected?.id]);

  useEffect(() => {
    if (open && isMulti && selected?.id) {
      refreshDocument(selected.id);
    }
  }, [selectedCpKey]);

  // УБРАН useEffect со scroll addEventListener - используем onItemsRendered в List

  const programKey = user?.default_accounting_program;
  const extraFields = programKey ? (EXTRA_FIELDS_CONFIG[programKey] || []) : [];

  const hasAnyCounterparty =
    !!(selected?.buyer_id || selected?.buyer_vat_code || selected?.buyer_name) ||
    !!(selected?.seller_id || selected?.seller_vat_code || selected?.seller_name);

  const ppLabel = isMulti
    ? (selectedCpKey
        ? (localPreview?.pirkimas_pardavimas_label || (hasAnyCounterparty ? "—" : "Pasirinkite kontrahentą"))
        : "Pasirinkite kontrahentą")
    : (selected?.pirkimas_pardavimas === "pirkimas"
        ? "Pirkimas"
        : selected?.pirkimas_pardavimas === "pardavimas"
          ? "Pardavimas"
          : "—");

  const pvmLabel = isMulti
    ? (selectedCpKey
        ? (localPreview?.pvm_kodas_label || (hasAnyCounterparty ? (previewLoading ? "Skaičiuojama…" : "—") : "Pasirinkite kontrahentą"))
        : "Pasirinkite kontrahentą")
    : (selected?.pvm_kodas || "—");

  const previewLinePvmById = (lineId) => {
    const arr = localPreview?.line_items || [];
    const hit = arr.find(li => String(li.id) === String(lineId));
    return hit?.pvm_kodas_label || hit?.pvm_kodas || null;
  };

  const handleClientSelect = (type) => async (valueObj) => {
    if (!valueObj || !selected?.id) return;

    const data = type === "buyer"
      ? {
          buyer_name: valueObj.pavadinimas,
          buyer_id: valueObj.imones_kodas,
          buyer_vat_code: valueObj.pvm_kodas,
          buyer_iban: valueObj.ibans,
          buyer_address: valueObj.address,
          buyer_country_iso: valueObj.country_iso,
        }
      : {
          seller_name: valueObj.pavadinimas,
          seller_id: valueObj.imones_kodas,
          seller_vat_code: valueObj.pvm_kodas,
          seller_iban: valueObj.ibans,
          seller_address: valueObj.address,
          seller_country_iso: valueObj.country_iso,
        };

    const res = await api.patch(
      `/scanned-documents/${selected.id}/extra-fields/`,
      data,
      { withCredentials: true }
    );

    setSelected(res.data);
    setDocs(prev => prev.map(d => sameId(d.id, selected.id) ? res.data : d));

    if (isMulti) {
      await refreshDocument(selected.id);
    }
  };

  function formatNumberPreview(value) {
    if (value === null || value === undefined || value === "") return "—";
    let num = Number(value);
    if (isNaN(num)) return value;

    let [int, dec = ""] = num.toFixed(4).split(".");
    if (dec.length < 4) dec = dec.padEnd(4, "0");

    if (dec[2] === "0" && dec[3] === "0") {
      return `${int}.${dec.slice(0, 2)}`;
    }
    return `${int}.${dec}`;
  }

  const handleClientClear = (type) => async () => {
    if (!selected?.id) return;

    const data = type === "buyer"
      ? {
          buyer_name: "",
          buyer_id: "",
          buyer_vat_code: "",
          buyer_iban: "",
          buyer_address: "",
          buyer_country_iso: "",
          apply_defaults: false,
        }
      : {
          seller_name: "",
          seller_id: "",
          seller_vat_code: "",
          seller_iban: "",
          seller_address: "",
          seller_country_iso: "",
          apply_defaults: false,
        };

    const res = await api.patch(
      `/scanned-documents/${selected.id}/extra-fields/`,
      data,
      { withCredentials: true }
    );
    setSelected(res.data);
    setDocs(prev => prev.map(d => sameId(d.id, selected.id) ? res.data : d));

    if (isMulti) {
      await refreshDocument(selected.id);
    }
  };

  const handleProductSelect = async (valueObj) => {
    if (!valueObj || !selected?.id) return;
    const data = {
      prekes_kodas: valueObj.prekes_kodas || valueObj.code || "",
      prekes_pavadinimas: valueObj.prekes_pavadinimas || valueObj.name || "",
      prekes_barkodas: valueObj.prekes_barkodas || valueObj.barkodas || valueObj.barcode || "",
    };

    const res = await api.patch(
      `/scanned-documents/${selected.id}/extra-fields/`,
      data,
      { withCredentials: true }
    );
    setSelected(res.data);
    setDocs(prev => prev.map(d => sameId(d.id, res.data.id) ? res.data : d));

    if (isMulti) {
      await refreshDocument(selected.id);
    }
  };

  const handleProductClear = async () => {
    if (!selected?.id) return;

    const res = await api.post(
      `/scanned-documents/${selected.id}/clear-product/`,
      {},
      { withCredentials: true }
    );

    setSelected(res.data);
    setDocs(prev => prev.map(d => sameId(d.id, res.data.id) ? res.data : d));

    if (isMulti) {
      await refreshDocument(selected.id);
    }
  };

  const handleLineItemProductSelect = (lineItemId) => async (valueObj) => {
    if (!valueObj || !selected?.id) return;
    const data = {
      prekes_kodas: valueObj.prekes_kodas || valueObj.code || "",
      prekes_pavadinimas: valueObj.prekes_pavadinimas || valueObj.name || "",
      prekes_barkodas: valueObj.prekes_barkodas || valueObj.barkodas || valueObj.barcode || "",
    };

    const res = await api.patch(
      `/scanned-documents/${selected.id}/lineitem/${lineItemId}/`,
      data,
      { withCredentials: true }
    );

    // Update in loaded line items
    setLineItemsLoaded(prev =>
      prev.map(li => sameId(li.id, lineItemId) ? { ...li, ...res.data } : li)
    );

    setSelected(prev => ({
      ...prev,
      line_items_count: prev.line_items_count,
    }));

    setDocs(prev =>
      prev.map(d =>
        sameId(d.id, selected.id) ? { ...d } : d
      )
    );

    if (isMulti) {
      await refreshDocument(selected.id);
    }
  };

  const handleLineItemProductClear = (lineItemId) => async () => {
    if (!selected?.id || !lineItemId) return;

    const res = await api.post(
      `/scanned-documents/${selected.id}/lineitem/${lineItemId}/clear-product/`,
      {},
      { withCredentials: true }
    );

    // Update in loaded line items
    setLineItemsLoaded(prev =>
      prev.map(li => sameId(li.id, lineItemId) ? { ...li, ...res.data } : li)
    );

    if (isMulti) {
      await refreshDocument(selected.id);
    }
  };

  const gluedRawText = useMemo(() => {
    const v = selected?.glued_raw_text;
    return typeof v === "string" ? v : (v == null ? "" : String(v));
  }, [selected]);

  const gptRawPretty = useMemo(() => {
    const raw = selected?.gpt_raw_json;
    if (raw == null) return "";
    try {
      const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
      return JSON.stringify(obj, null, 2);
    } catch {
      return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    }
  }, [selected]);

  const structuredPretty = useMemo(() => {
    const raw = selected?.structured_json;
    if (raw == null) return "";
    try {
      const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
      return JSON.stringify(obj, null, 2);
    } catch {
      return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    }
  }, [selected]);

  const copyToClipboard = async (text) => {
    try { await navigator.clipboard.writeText(text || ""); } catch {}
  };

  const PRODUCT_FIELDS = [
    { field: "prekes_pavadinimas", label: "Prekės pavadinimas:" },
    { field: "prekes_kodas", label: "Prekės kodas:" },
    { field: "prekes_barkodas", label: "Prekės barkodas:" },
  ];

  const accordionRef = useRef(null);

  const handleAccordionChange = (event, expanded) => {
    setAccordionExpanded(expanded);

    if (!expanded) {
      setLineItemsLoaded([]);
      setLineItemsOffset(0);
      return;
    }

    // открыли: всегда стартуем с нуля
    setLineItemsLoaded([]);
    setLineItemsOffset(0);

    if (selected?.id && (selected?.line_items_count > 0 || lineItemsTotal > 0)) {
      loadLineItems(selected.id, 0, false);
    }

    if (accordionRef.current) {
      setTimeout(() => {
        accordionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  };

  if (!selected) return null;

  const CURRENCIES = [
    "EUR","USD","GBP",
    "AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN","BAM","BBD","BDT","BGN","BHD",
    "BIF","BMD","BND","BOB","BOV","BRL","BSD","BTN","BWP","BYN","BZD","CAD","CDF","CHE","CHF",
    "CHW","CLF","CLP","CNY","COP","COU","CRC","CUC","CUP","CVE","CZK","DJF","DKK","DOP","DZD",
    "EGP","ERN","ETB","FJD","FKP","GEL","GHS","GIP","GMD","GNF","GTQ","GYD","HKD","HNL","HRK",
    "HTG","HUF","IDR","ILS","INR","IQD","IRR","ISK","JMD","JOD","JPY","KES","KGS","KHR","KMF",
    "KPW","KRW","KWD","KYD","KZT","LAK","LBP","LKR","LRD","LSL","LYD","MAD","MDL","MGA","MKD",
    "MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MXV","MYR","MZN","NAD","NGN","NIO","NOK",
    "NPR","NZD","OMR","PAB","PEN","PGK","PHP","PKR","PLN","PYG","QAR","RON","RSD","RUB","RWF",
    "SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLE","SLL","SOS","SRD","SSP","STN","SVC","SZL",
    "THB","TJS","TMT","TND","TOP","TRY","TTD","TWD","TZS","UAH","UGX","USN","UYI","UYU","UZS",
    "VED","VEF","VND","VUV","WST","XAF","XAG","XAU","XBA","XBB","XBC","XBD","XCD","XDR","XOF",
    "XPD","XPF","XPT","XSU","XUA","YER","ZAR","ZMW","ZWL"
  ];
  const TAIP_NE = [{ label:"Taip", value:true }, { label:"Ne", value:false }];

  const ensureDate = (v) => {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Formatas: YYYY-MM-DD");
    return s;
  };
  const ensureNumber = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (Number.isNaN(n)) throw new Error("Turi būti skaičius");
    return n;
  };

  const normVal = (v) => {
    if (v === "" || v === undefined) return null;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
    return v;
  };

  const saveDocFields = async (patchOrField, maybeValue) => {
    if (!selected?.id) return;

    const updates = Array.isArray(patchOrField)
      ? patchOrField
      : (typeof patchOrField === "object" && patchOrField !== null)
        ? Object.entries(patchOrField)
        : [[patchOrField, maybeValue]];

    let latestSelected = selected;

    for (const [field, raw] of updates) {
      const value = normVal(raw);
      const res = await api.patch(
        `/scanned-documents/${latestSelected.id}/inline/`,
        { field, value },
        { withCredentials: true }
      );

      latestSelected = { 
        ...latestSelected, 
        [field]: res.data[field],
        ...(res.data.ready_for_export !== undefined && { 
          ready_for_export: res.data.ready_for_export 
        }),
        ...(res.data.math_validation_passed !== undefined && { 
          math_validation_passed: res.data.math_validation_passed 
        })
      };
    }

    setSelected(latestSelected);
    setDocs(prev => prev.map(d => (String(d.id) === String(latestSelected.id) ? latestSelected : d)));

    if (isMulti) await refreshDocument(latestSelected.id);
  };

  const saveLineFields = async (lineId, patchOrField, maybeValue) => {
    if (!selected?.id || !lineId) return;

    const updates = Array.isArray(patchOrField)
      ? patchOrField
      : (typeof patchOrField === "object" && patchOrField !== null)
        ? Object.entries(patchOrField)
        : [[patchOrField, maybeValue]];

    let changed = {};
    let mathValidationResult = null;

    for (const [field, raw] of updates) {
      const value = normVal(raw);
      const res = await api.patch(
        `/scanned-documents/${selected.id}/lineitem/${lineId}/inline/`,
        { field, value },
        { withCredentials: true }
      );
      changed[field] = res.data[field];
      
      if (res.data.math_validation_passed !== undefined) {
        mathValidationResult = res.data.math_validation_passed;
      }
    }

    // Update in loaded line items
    setLineItemsLoaded(prev =>
      prev.map(li => String(li.id) === String(lineId) ? { ...li, ...changed } : li)
    );

    setSelected(prev => ({
      ...prev,
      ...(mathValidationResult !== null && { 
        math_validation_passed: mathValidationResult 
      })
    }));

    setDocs(prev => prev.map(d =>
      String(d.id) === String(selected.id)
        ? {
            ...d,
            ...(mathValidationResult !== null && { 
              math_validation_passed: mathValidationResult 
            })
          }
        : d
    ));

    if (isMulti) await refreshDocument(selected.id);
  };

  const addLineItem = async () => {
    if (!selected?.id) return;
    const res = await api.post(`/scanned-documents/${selected.id}/add-lineitem/`, {}, { withCredentials: true });
    const newItem = res.data;

    // Add to loaded line items
    setLineItemsLoaded(prev => [...prev, newItem]);
    setLineItemsTotal(prev => prev + 1);

    setSelected(prev => ({
      ...prev,
      line_items_count: (prev.line_items_count || 0) + 1,
    }));

    setDocs(prev =>
      prev.map(d =>
        String(d.id) === String(selected.id)
          ? { ...d, line_items_count: (d.line_items_count || 0) + 1 }
          : d
      )
    );

    // Скролл к последнему элементу через List ref
    setTimeout(() => {
      const el = lineItemsContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  };

  const deleteLineItem = async (lineId) => {
    if (!selected?.id) return;
    const currentCount = lineItemsLoaded.length;
    if (currentCount <= 1) {
      window.alert("Negalima ištrinti vienintelės eilutės.");
      return;
    }

    const confirmed = window.confirm("Ar tikrai norite ištrinti prekę?");
    if (!confirmed) return;

    await api.delete(`/scanned-documents/${selected.id}/delete-lineitem/${lineId}/`, { withCredentials: true });

    // Remove from loaded line items
    setLineItemsLoaded(prev => prev.filter(li => li.id !== lineId));
    setLineItemsTotal(prev => prev - 1);
    setLineItemsOffset(prev => Math.max(0, prev - 1));

    setSelected(prev => ({
      ...prev,
      line_items_count: Math.max(0, (prev.line_items_count || 1) - 1),
    }));

    setDocs(prev =>
      prev.map(d =>
        String(d.id) === String(selected.id)
          ? { ...d, line_items_count: Math.max(0, (d.line_items_count || 1) - 1) }
          : d
      )
    );
  };

  const renderValidationFlags = () => {
    const readyForExport = selected?.ready_for_export;
    const mathValidation = selected?.math_validation_passed;

    return (
      <Box sx={{ mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Chip
          icon={
            readyForExport === true ? <CheckCircleIcon /> :
            readyForExport === false ? <ErrorIcon /> :
            <HourglassEmptyIcon />
          }
          label={
            readyForExport === true ? "Paruošta eksportui" :
            readyForExport === false ? "Trūksta duomenų" :
            "Laukiama patvirtinimo"
          }
          color={
            readyForExport === true ? "success" :
            readyForExport === false ? "error" :
            "default"
          }
          variant={readyForExport === null ? "outlined" : "filled"}
          size="small"
        />

        <Chip
          icon={
            mathValidation === true ? <CheckCircleIcon /> :
            mathValidation === false ? <ErrorIcon /> :
            <HourglassEmptyIcon />
          }
          label={
            mathValidation === true ? "Sumos sutampa" :
            mathValidation === false ? "Sumos nesutampa" :
            "Laukiama patikrinimo"
          }
          color={
            mathValidation === true ? "success" :
            mathValidation === false ? "warning" :
            "default"
          }
          variant={mathValidation === null ? "outlined" : "filled"}
          size="small"
        />
      </Box>
    );
  };

  const lineItemsCount = (lineItemsTotal ?? selected?.line_items_count ?? 0);

  const headerLoading = accordionExpanded && lineItemsLoading;

  // Проверка: separate_vat для отображения "Keli skirtingi PVM %"
  const hasSeparateVat = selected?.separate_vat === true;
  const separateVatLabel = "Keli skirtingi PVM %";

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
      <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth TransitionProps={{ timeout: 0.1 }}>
        <DialogTitle
          sx={{
            fontWeight: 500,
            fontSize: 18,
            pr: 5,
            pb: 1,
            position: "relative",
            minHeight: 44,
          }}
        >
          Peržiūra
          <IconButton
            aria-label="close"
            onClick={handleClose}
            sx={{
              position: 'absolute',
              right: 10,
              top: 8,
              zIndex: 2000,
              color: (theme) => theme.palette.grey[500],
              p: 1,
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            display: "flex",
            gap: 4,
            fontSize: 15,
            '*': { fontSize: "inherit" },
            minHeight: 400,
            maxHeight: "80vh",
            overflow: "auto",
            pointerEvents: closing ? "none" : "auto",
          }}
        >
          <Box
            width="50%"
            sx={{
              position: "sticky",
              top: 12,
              alignSelf: "flex-start",
              maxHeight: "75vh",
              minHeight: 320,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "#fff",
              borderRadius: 2,
              border: "1px solid #eee",
              p: 2,
              boxShadow: "0 2px 8px #0001",
            }}
          >
            {selected.preview_url ? (
              <ZoomableImage src={selected.preview_url} />
            ) : (
              <Typography color="text.secondary">Peržiūra negalima</Typography>
            )}
          </Box>

          <Box width="50%" sx={{ px: 0.5 }}>
            {selected.error_message ? (
              <Typography color="error">{selected.error_message}</Typography>
            ) : (
              <>
                {renderValidationFlags()}

                <Typography gutterBottom>
                  Pirkimas/pardavimas:&nbsp;
                  <b>{ppLabel}{isMulti && previewLoading ? "…" : ""}</b>
                </Typography>

                <Typography gutterBottom>
                  Dokumento tipas: <b>{selected.document_type || "—"}</b>
                </Typography>
                <Divider sx={{ my: 1 }} />

                <Grid2 container spacing={2} sx={{ mb: 2 }}>
                  <Grid2 size={6}>
                    <Typography sx={{ mb: 1.5, fontWeight: 500, fontSize: "0.95rem", display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      Pirkėjas
                      <SwapBuyerSellerButton 
                        documentId={selected?.id}
                        sellerName={selected?.seller_name}
                        buyerName={selected?.buyer_name}
                        onSwapComplete={async (data) => {
                          setSelected(prev => ({
                            ...prev,
                            seller_name: data.seller_name,
                            buyer_name: data.buyer_name,
                          }));
                          setDocs(prev => prev.map(d => 
                            String(d.id) === String(selected.id) 
                              ? { ...d, seller_name: data.seller_name, buyer_name: data.buyer_name }
                              : d
                          ));
                          await refreshDocument(selected.id);
                        }}
                      />
                    </Typography>
                    {["buyer_name", "buyer_id", "buyer_vat_code"].map((field) => {
                      const isVatField = field === "buyer_vat_code";
                      const vatMeta = isVatField ? mapVatStatus(selected?.buyer_vat_val) : null;
                      const isNameField = field === "buyer_name";
                      const hasError = isNameField && showFieldErrors && missingDocFields.has('buyer_name');

                      return (
                        <Box 
                          key={field} 
                          sx={{ 
                            mb: 1,
                            ...(hasError && {
                              border: '1.5px solid #d32f2f',
                              borderRadius: '4px',
                              boxShadow: '0 0 4px 1px rgba(211, 47, 47, 0.25)',
                              p: 0.5,
                            }),
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
                            <Typography variant="caption" color="text.secondary">
                              {EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.label ||
                                field}
                            </Typography>
                            {isVatField && vatMeta && (
                              <Chip
                                icon={vatMeta.icon}
                                label={vatMeta.label}
                                color={vatMeta.color}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: "0.7rem",
                                  "& .MuiChip-label": { px: 0.5, pr: 1 },
                                  "& .MuiChip-icon": { fontSize: "0.9rem", ml: 0.5, mr: 0.025 },
                                }}
                              />
                            )}
                          </Box>
                          <EditableAutoCell
                            fieldName={field}
                            label={
                              EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.label ||
                              "Pasirinkite…"
                            }
                            value={selected[field] || ""}
                            searchUrl={EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.search}
                            onSelect={handleClientSelect("buyer")}
                            onManualSave={async (text) => {
                              if (!selected?.id) return;
                              const res = await api.patch(
                                `/scanned-documents/${selected.id}/extra-fields/`,
                                { [field]: text || null },
                                { withCredentials: true }
                              );
                              setSelected(res.data);
                              setDocs((prev) =>
                                prev.map((d) =>
                                  String(d.id) === String(selected.id) ? res.data : d
                                )
                              );
                              if (isMulti) await refreshDocument(selected.id);
                            }}
                            onClear={async () => {
                              await handleClientClear("buyer")();
                            }}
                            sx={{
                              width: "100%",
                              "& .MuiInputBase-root": {
                                fontSize: "0.875rem",
                              },
                              "& input": {
                                fontSize: "0.875rem",
                              },
                            }}
                          />
                        </Box>
                      );
                    })}
                  </Grid2>

                  <Grid2 size={6}>
                    <Typography sx={{ mb: 1.5, fontWeight: 500, fontSize: "0.95rem" }}>
                      Pardavėjas
                    </Typography>
                    {["seller_name", "seller_id", "seller_vat_code"].map((field) => {
                      const isVatField = field === "seller_vat_code";
                      const vatMeta = isVatField ? mapVatStatus(selected?.seller_vat_val) : null;
                      const isNameField = field === "seller_name";
                      const hasError = isNameField && showFieldErrors && missingDocFields.has('seller_name');

                      const fieldNameForAuto = field.includes("_name")
                        ? "prekes_pavadinimas"
                        : field.includes("_id")
                        ? "prekes_kodas"
                        : "prekes_barkodas";

                      return (
                        <Box 
                          key={field} 
                          sx={{ 
                            mb: 1,
                            ...(hasError && {
                              border: '1.5px solid #d32f2f',
                              borderRadius: '4px',
                              boxShadow: '0 0 4px 1px rgba(211, 47, 47, 0.25)',
                              p: 0.5,
                            }),
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
                            <Typography variant="caption" color="text.secondary">
                              {EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.label ||
                                field}
                            </Typography>
                            {isVatField && vatMeta && (
                              <Chip
                                icon={vatMeta.icon}
                                label={vatMeta.label}
                                color={vatMeta.color}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: "0.7rem",
                                  "& .MuiChip-label": { px: 0.5, pr: 1 },
                                  "& .MuiChip-icon": { fontSize: "0.9rem", ml: 0.5, mr: 0.025 },
                                }}
                              />
                            )}
                          </Box>
                          <EditableAutoCell
                            fieldName={fieldNameForAuto}
                            label={
                              EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.label ||
                              "Pasirinkite…"
                            }
                            value={selected[field] || ""}
                            searchUrl={EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.search}
                            onSelect={handleClientSelect("seller")}
                            onManualSave={async (text) => {
                              if (!selected?.id) return;
                              const res = await api.patch(
                                `/scanned-documents/${selected.id}/extra-fields/`,
                                { [field]: text || null },
                                { withCredentials: true }
                              );
                              setSelected(res.data);
                              setDocs((prev) =>
                                prev.map((d) =>
                                  String(d.id) === String(selected.id) ? res.data : d
                                )
                              );
                              if (isMulti) await refreshDocument(selected.id);
                            }}
                            onClear={async () => {
                              await handleClientClear("seller")();
                            }}
                            sx={{
                              width: "100%",
                              "& .MuiInputBase-root": {
                                fontSize: "0.875rem",
                              },
                              "& input": {
                                fontSize: "0.875rem",
                              },
                            }}
                          />
                        </Box>
                      );
                    })}
                  </Grid2>
                </Grid2>


                <Divider sx={{ my: 1 }} />

                <Stack spacing={0.5} mt={1} mb={1}>
                  <Typography>Sąskaitos data: <EditableCell value={selected.invoice_date} inputType="date" onSave={(v) => saveDocFields("invoice_date", ensureDate(v))} sx={getDocFieldErrorSx('invoice_date')} /></Typography>
                  <Typography>Mokėti iki: <EditableCell value={selected.due_date} inputType="date" onSave={(v) => saveDocFields("due_date", ensureDate(v))} /></Typography>
                  <Typography>Operacijos data: <EditableCell value={selected.operation_date} inputType="date" onSave={(v) => saveDocFields("operation_date", ensureDate(v))} /></Typography>
                  <Typography>Sąskaitos serija: <EditableCell value={selected.document_series} onSave={(v) => saveDocFields("document_series", v)} /></Typography>
                  <Typography>Sąskaitos numeris: <EditableCell value={selected.document_number} onSave={(v) => saveDocFields("document_number", v)} sx={getDocFieldErrorSx('document_number')} /></Typography>
                  <Typography>Užsakymo numeris: <EditableCell value={selected.order_number} onSave={(v) => saveDocFields("order_number", v)} /></Typography>
                  <Typography>Nuolaida sąskaitai (be PVM): <EditableCell value={selected.invoice_discount_wo_vat} inputType="number" onSave={(v) => saveDocFields("invoice_discount_wo_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                  <Typography>Nuolaida sąskaitai (su PVM): <EditableCell value={selected.invoice_discount_with_vat} inputType="number" onSave={(v) => saveDocFields("invoice_discount_with_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                  <Typography>Suma (be PVM): <EditableCell value={selected.amount_wo_vat} inputType="number" onSave={(v) => saveDocFields("amount_wo_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} sx={getDocFieldErrorSx('amount_wo_vat')} /></Typography>
                  <Typography>PVM: <EditableCell value={selected.vat_amount} inputType="number" onSave={(v) => saveDocFields("vat_amount", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} sx={getDocFieldErrorSx('vat_amount')} /></Typography>
                  
                  {/* PVM % — если separate_vat, показываем текст и не даём редактировать */}
                  <Typography>
                    PVM %:{" "}
                    {hasSeparateVat ? (
                      <b>{separateVatLabel}</b>
                    ) : (
                      <EditableCell 
                        value={selected.vat_percent} 
                        inputType="number" 
                        onSave={(v) => saveDocFields("vat_percent", ensureNumber(v))} 
                        renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>}
                        sx={getDocFieldErrorSx('vat_percent')}
                      />
                    )}
                  </Typography>
                  
                  {/* PVM klasė — если separate_vat, показываем тот же текст */}
                  <Typography>
                    PVM klasė:{" "}
                    {hasSeparateVat ? (
                      <b>{separateVatLabel}</b>
                    ) : (
                      <b>{pvmLabel}{isMulti && previewLoading ? "…" : ""}</b>
                    )}
                  </Typography>
                  
                  <Typography>Suma (su PVM): <EditableCell value={selected.amount_with_vat} inputType="number" onSave={(v) => saveDocFields("amount_with_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} sx={getDocFieldErrorSx('amount_with_vat')} /></Typography>
                  <Typography>Valiuta: <EditableCell
                    value={selected.currency}
                    inputType="select"
                    options={CURRENCIES}
                    onSave={(v)=>saveDocFields("currency", v)}
                    sx={getDocFieldErrorSx('currency')}
                  /></Typography>

                  <Typography>Mokėta grynais: <EditableCell
                    value={selected.paid_by_cash}
                    inputType="select"
                    options={TAIP_NE}
                    getOptionLabel={(o)=>o.label}
                    onSave={(v)=>saveDocFields("paid_by_cash", v)}
                    renderDisplay={(v)=> (v===true ? "Taip" : v===false ? "Ne" : "—")}
                  /></Typography>

                  {selected.scan_type === "sumiskai" && (
                    <Grid2 container spacing={2} sx={{ mb: 2 }}>
                      <Grid2 xs={12}>
                        {PRODUCT_FIELDS.map(({ field, label }) => {
                          const cfg = EXTRA_FIELDS_CONFIG.product.find(f => f.name === field);

                          return (
                            <Stack
                              key={field}
                              direction="row"
                              alignItems="center"
                              spacing={1}
                              sx={{ mb: 1 }}
                            >
                              <Typography color="text.secondary" sx={{ minWidth: 130, color: "black" }}>
                                {label}
                              </Typography>

                              <EditableAutoCell
                                label={label}
                                value={selected[field] || ""}
                                searchUrl={cfg?.search}
                                onSelect={handleProductSelect}
                                onManualSave={(text) =>
                                  saveDocFields({ [field]: text || null })
                                }
                                onClear={() => handleProductClear()}
                                sx={{
                                  flex: 1,
                                  "& .MuiInputBase-root": {
                                    minHeight: "28px",
                                    background: "transparent",
                                    fontSize: "inherit",
                                    px: 1,
                                  },
                                  "& input": {
                                    padding: 0,
                                    fontSize: "inherit",
                                  },
                                }}
                              />
                            </Stack>
                          );
                        })}
                      </Grid2>
                    </Grid2>
                  )}
                </Stack>

                {selected.scan_type === "detaliai" && lineItemsCount > 0 && (
                  <Accordion 
                    expanded={!closing && accordionExpanded}
                    onChange={handleAccordionChange} 
                    ref={accordionRef}
                    sx={{ 
                      mt: 1, 
                      background: "#fafafa",
                      ...(lineItemsHaveErrors && accordionErrorSx),
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                        <Typography>
                          Prekė(s): {lineItemsCount} {ltEilutes(lineItemsCount)}
                        </Typography>

                        {/* loader только справа от текста */}
                        {headerLoading && (
                          <CircularProgress
                            size={26}        // было 16 — сделай 20-24
                            thickness={8}    // "жирность" круга (по умолчанию 3.6)
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          color="primary"
                          onClick={addLineItem}
                        >
                          + Pridėti eilutę
                        </Button>
                      </Box>
                      
                      {!closing && accordionExpanded && (
                        <Box
                          ref={lineItemsContainerRef}
                          sx={{ maxHeight: 500, overflowY: "auto", pr: 1 }}
                        >
                          {lineItemsLoaded.map((item, index) => {
                            const canDelete = lineItemsLoaded.length > 1;
                            const previewLinePvm = isMulti
                              ? (item.pvm_kodas_label || item.pvm_kodas || (previewLoading ? "Skaičiuojama…" : "—"))
                              : (item.pvm_kodas || item.vat_class || "—");

                            return (
                              <LineItemCard
                                key={item.id}
                                item={item}
                                index={index}
                                canDelete={canDelete}
                                previewLinePvm={previewLinePvm}
                                onDelete={deleteLineItem}
                                onProductSelect={handleLineItemProductSelect}
                                onProductClear={handleLineItemProductClear}
                                onSaveFields={saveLineFields}
                                formatNumberPreview={formatNumberPreview}
                                PRODUCT_FIELDS={PRODUCT_FIELDS}
                                EXTRA_FIELDS_CONFIG={EXTRA_FIELDS_CONFIG}
                                showErrors={showFieldErrors}
                              />
                            );
                          })}

                          {accordionExpanded && lineItemsLoading && lineItemsLoaded.length === 0 && (
                            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                              <CircularProgress size={24} />
                            </Box>
                          )}

                          {!lineItemsLoading && lineItemsLoaded.length === 0 && lineItemsTotal === 0 && (
                            <Typography color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                              Nėra prekių
                            </Typography>
                          )}

                          {lineItemsLoaded.length > 0 && lineItemsLoaded.length < lineItemsTotal && (
                            <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Button
                                  onClick={loadMoreLineItems}
                                  variant="text"
                                  disabled={lineItemsLoadingMore}
                                  sx={{ minHeight: 36 }}
                                >
                                  Įkelti daugiau ({lineItemsTotal - lineItemsLoaded.length} liko)
                                </Button>

                                {lineItemsLoadingMore && (
                                  <CircularProgress size={26} thickness={8} />
                                )}
                              </Box>
                            </Box>
                          )}
                        </Box>
                      )}          
                      
                      {!closing && accordionExpanded && lineItemsLoading && lineItemsLoaded.length === 0 && (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                          <CircularProgress size={28} thickness={5} />
                        </Box>
                      )}
                      
                      {!closing && accordionExpanded && !lineItemsLoading && lineItemsLoaded.length === 0 && lineItemsTotal === 0 && (
                        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                          Nėra prekių
                        </Typography>
                      )}
                    </AccordionDetails>
                  </Accordion>
                )}
                {showRawPanels && (
                  <Accordion sx={{ mt: 2, background: "#f6f8ff" }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography sx={{ fontWeight: 500 }}>Admin: Raw duomenys</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box sx={{ mb: 2 }}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                          <Typography variant="subtitle2">OCR (glued_raw_text)</Typography>
                          <Tooltip title="Kopijuoti">
                            <IconButton size="small" onClick={() => copyToClipboard(gluedRawText)}>
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Paper variant="outlined" sx={{ p: 2, maxHeight: 280, overflow: "auto", bgcolor: "#fafafa" }}>
                          <Box
                            component="pre"
                            sx={{ m: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace", fontSize: 13 }}
                          >
                            {gluedRawText || "—"}
                          </Box>
                        </Paper>
                      </Box>

                      <Divider sx={{ my: 2 }} />

                      <Box>
                        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                          <Typography variant="subtitle2">Structured JSON</Typography>
                          <Tooltip title="Kopijuoti">
                            <IconButton size="small" onClick={() => copyToClipboard(structuredPretty)}>
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Paper variant="outlined" sx={{ p: 2, maxHeight: 380, overflow: "auto", bgcolor: "#0b1020" }}>
                          <Box
                            component="pre"
                            sx={{
                              m: 0,
                              whiteSpace: "pre",
                              color: "#c9e1ff",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                              fontSize: 12,
                            }}
                          >
                            {structuredPretty || "—"}
                          </Box>
                        </Paper>
                      </Box>

                      {user?.is_superuser && (
                        <>
                          <Divider sx={{ my: 2 }} />
                          <Box>
                            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                              <Typography variant="subtitle2" sx={{ color: "#1b4121ff", fontWeight: 500 }}>
                                GPT raw JSON
                              </Typography>
                              <Tooltip title="Kopijuoti">
                                <IconButton size="small" onClick={() => copyToClipboard(gptRawPretty)}>
                                  <ContentCopyIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                            <Paper
                              variant="outlined"
                              sx={{
                                p: 2,
                                maxHeight: 420,
                                overflow: "auto",
                                bgcolor: "#0b1020",
                                borderColor: "#cbef9aff",
                              }}
                            >
                              <Box
                                component="pre"
                                sx={{
                                  m: 0,
                                  whiteSpace: "pre",
                                  color: "#f5ffe6ff",
                                  fontFamily:
                                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                                  fontSize: 12,
                                }}
                              >
                                {gptRawPretty || "—"}
                              </Box>
                            </Paper>
                          </Box>
                        </>
                      )}
                    </AccordionDetails>
                  </Accordion>
                )}
              </>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </LocalizationProvider>
  );
}







// import { LocalizationProvider } from '@mui/x-date-pickers';
// import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
// import dayjs from 'dayjs';
// import 'dayjs/locale/lt';
// import React from 'react';
// import SwapBuyerSellerButton from './SwapBuyerSellerButton';

// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   Box,
//   Typography,
//   Divider,
//   Accordion, AccordionSummary, AccordionDetails,
//   Stack,
//   Grid2,
//   Paper,
//   Tooltip,
//   Button,
//   Chip,
//   CircularProgress,
// } from "@mui/material";
// import DeleteIcon from "@mui/icons-material/Delete";
// import ContentCopyIcon from '@mui/icons-material/ContentCopy';
// import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
// import CheckCircleIcon from '@mui/icons-material/CheckCircle';
// import ErrorIcon from '@mui/icons-material/Error';
// import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
// import ZoomableImage from "../pages/ZoomableImage";
// import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";
// import { api } from "../api/endpoints";
// import { useEffect, useRef, useState, useMemo, useCallback } from "react";
// import CloseIcon from '@mui/icons-material/Close';
// import IconButton from '@mui/material/IconButton';

// import EditableCell from "../components/EditableCell";
// import EditableAutoCell from "../components/EditableAutoCell";


// const LINE_ITEMS_LIMIT = 30;


// const mapVatStatus = (status) => {
//   switch (status) {
//     case "valid":
//       return {
//         label: "PVM galioja",
//         color: "success",
//         icon: <CheckCircleIcon />,
//       };
//     case "invalid":
//       return {
//         label: "PVM negalioja",
//         color: "error",
//         icon: <ErrorIcon />,
//       };
//     default:
//       return null;
//   }
// };

// const ltEilutes = (n) => {
//   const num = Math.abs(Number(n) || 0);
//   const last2 = num % 100;
//   const last1 = num % 10;

//   if (last2 >= 11 && last2 <= 19) return "eilučių"; // 11–19 
//   if (last1 === 1) return "eilutė";                 // 1, 21, 31...
//   if (last1 >= 2 && last1 <= 9) return "eilutės";   // 2–9, 22–29...
//   return "eilučių";                                 // 0, 10, 20, 30...
// };

// const LineItemCard = React.memo(({ 
//   item, 
//   index,
//   canDelete,
//   previewLinePvm,
//   onDelete,
//   onProductSelect,
//   onProductClear,
//   onSaveFields,
//   formatNumberPreview,
//   PRODUCT_FIELDS,
//   EXTRA_FIELDS_CONFIG,
// }) => {
//   return (
//     <Box
//       sx={{
//         mb: 2,
//         p: 2,
//         border: "1px solid #eee",
//         borderRadius: 2,
//         background: "#fff",
//         position: "relative",
//       }}
//     >
//       <Tooltip title={canDelete ? "Ištrinti eilutę" : "Negalima ištrinti vienintelės eilutės"}>
//         <IconButton
//           size="small"
//           onClick={() => canDelete && onDelete(item.id)}
//           disabled={!canDelete}
//           sx={{
//             position: "absolute",
//             top: 6,
//             right: 6,
//             color: "text.secondary",
//             "&:hover": canDelete ? { color: "error.main" } : undefined,
//           }}
//         >
//           <DeleteIcon fontSize="small" />
//         </IconButton>
//       </Tooltip>

//       <Typography
//         sx={{
//           fontWeight: 100,
//           marginBottom: 3,
//           fontStyle: "italic",
//         }}
//       >
//         {`Prekė #${index + 1}`}
//       </Typography>

//       {PRODUCT_FIELDS.map(({ field, label }) => {
//         const cfg = EXTRA_FIELDS_CONFIG.product.find(f => f.name === field);
//         return (
//           <Stack
//             key={`${item.id}-${field}`}
//             direction="row"
//             alignItems="center"
//             spacing={1}
//             sx={{ mb: 1 }}
//           >
//             <Typography color="text.secondary" sx={{ minWidth: 130, color: "black" }}>
//               {label}
//             </Typography>

//             <EditableAutoCell
//               label={cfg?.label || "Pasirinkite…"}
//               value={item[field] || ""}
//               searchUrl={cfg?.search}
//               onSelect={onProductSelect(item.id)}
//               onManualSave={(text) => onSaveFields(item.id, { [field]: text || null })}
//               onClear={onProductClear(item.id)}
//               sx={{
//                 flex: 1,
//                 "& .MuiInputBase-root": {
//                   minHeight: "28px",
//                   background: "transparent",
//                   fontSize: "14px",
//                   px: 1,
//                 },
//                 "& input": { padding: 0, fontSize: "14px", fontWeight: 700 },
//               }}
//             />
//           </Stack>
//         );
//       })}

//       <Stack spacing={0.5} mt={1} mb={1}>
//         <Typography>Mato vnt: <EditableCell value={item.unit} onSave={(v) => onSaveFields(item.id, "unit", v)} /></Typography>
//         <Typography>Kiekis: <EditableCell value={item.quantity} inputType="number" onSave={(v) => onSaveFields(item.id, "quantity", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//         <Typography>Kaina: <EditableCell value={item.price} inputType="number" onSave={(v) => onSaveFields(item.id, "price", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//         <Typography>Suma (be PVM): <EditableCell value={item.subtotal} inputType="number" onSave={(v) => onSaveFields(item.id, "subtotal", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//         <Typography>PVM: <EditableCell value={item.vat} inputType="number" onSave={(v) => onSaveFields(item.id, "vat", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//         <Typography>PVM %: <EditableCell value={item.vat_percent} inputType="number" onSave={(v) => onSaveFields(item.id, "vat_percent", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//         <Typography>PVM klasė: <b>{previewLinePvm}</b></Typography>
//         <Typography>Suma (su PVM): <EditableCell value={item.total} inputType="number" onSave={(v) => onSaveFields(item.id, "total", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//         <Typography>Nuolaida (be PVM): <b>{formatNumberPreview(item.discount_wo_vat)}</b></Typography>
//         <Typography>Nuolaida (su PVM): <b>{formatNumberPreview(item.discount_with_vat)}</b></Typography>
//       </Stack>
//     </Box>
//   );
// });


// export default function PreviewDialog({
//   open,
//   onClose,
//   selected,
//   setSelected,
//   setDocs,
//   user,
//   selectedCpKey,
//   showRawPanels = false,
// }) {
//   const prevDocId = useRef();
//   const isMulti = user?.view_mode === "multi";

//   const sameId = (a, b) => String(a) === String(b);

//   const [localPreview, setLocalPreview] = useState(null);
//   const [previewLoading, setPreviewLoading] = useState(false);
//   const lastReqIdRef = useRef(0);
//   const abortRef = useRef(null);

//   // Line items lazy loading state
//   const [lineItemsLoaded, setLineItemsLoaded] = useState([]);
//   const [lineItemsOffset, setLineItemsOffset] = useState(0);
//   const [lineItemsTotal, setLineItemsTotal] = useState(0);
//   const [lineItemsLoading, setLineItemsLoading] = useState(false);
//   const [lineItemsLoadingMore, setLineItemsLoadingMore] = useState(false);
//   const [accordionExpanded, setAccordionExpanded] = useState(false);
//   const lineItemsContainerRef = useRef(null);

//   // Closing state для мгновенного закрытия
//   const [closing, setClosing] = useState(false);
//   const closingRef = useRef(false);

//   const lineItemsReqLockRef = useRef(false);

//   useEffect(() => {
//     closingRef.current = closing;
//   }, [closing]);

//   const mkKey = (id, vat, name) => {
//     const idStr = id == null ? "" : String(id).trim();
//     if (idStr) return `id:${idStr}`;
//     const normVat  = (vat  || "").trim().toLowerCase();
//     const normName = (name || "").trim().toLowerCase();
//     return normVat || normName;
//   };

//   const optimisticDirection = useMemo(() => {
//     if (!isMulti || !selected) return null;
//     if (!selectedCpKey) return null;
//     const sKey = mkKey(selected.seller_id, selected.seller_vat_code, selected.seller_name);
//     const bKey = mkKey(selected.buyer_id,  selected.buyer_vat_code,  selected.buyer_name);
//     if (selectedCpKey === sKey && sKey) return "pardavimas";
//     if (selectedCpKey === bKey && bKey) return "pirkimas";
//     return null;
//   }, [isMulti, selected, selectedCpKey]);

//   const ppText = (code) =>
//     code === "pirkimas" ? "Pirkimas" : code === "pardavimas" ? "Pardavimas" : "Pasirinkite kontrahentą";

//   // Load line items with pagination

//   const loadLineItems = useCallback(async (docId, offset = 0, append = false) => {
//     if (closingRef.current) return;
//     if (lineItemsReqLockRef.current) return;

//     lineItemsReqLockRef.current = true;
//     if (append) setLineItemsLoadingMore(true);
//     else setLineItemsLoading(true);

//     try {
//       const res = await api.get(`/documents/${docId}/lineitems/`, {
//         params: {
//           limit: LINE_ITEMS_LIMIT,
//           offset,
//           ...(isMulti && selectedCpKey ? { cp_key: selectedCpKey } : {}),
//         },
//         withCredentials: true,
//       });

//       if (closingRef.current) return;

//       const { results = [], count = 0 } = res.data || {};
//       setLineItemsTotal(count);

//       setLineItemsLoaded(prev => {
//         const next = append ? [...prev, ...results] : results;
//         const map = new Map();
//         for (const x of next) map.set(String(x.id), x);
//         return Array.from(map.values());
//       });

//       setLineItemsOffset(prev => (append ? prev + results.length : results.length));
//     } catch (e) {
//       console.error("Failed to load line items:", e);
//     } finally {
//       lineItemsReqLockRef.current = false;
//       if (!closingRef.current) {
//         setLineItemsLoading(false);
//         setLineItemsLoadingMore(false);
//       }
//     }
//   }, [isMulti, selectedCpKey]);

//   // const loadLineItems = useCallback(async (docId, offset = 0, append = false) => {
//   //   if (closingRef.current) return;
//   //   if (lineItemsReqLockRef.current) return;   // 🔒 синхронный лок

//   //   lineItemsReqLockRef.current = true;
//   //   if (append) setLineItemsLoadingMore(true);
//   //   else setLineItemsLoading(true);

//   //   try {
//   //     const res = await api.get(`/documents/${docId}/lineitems/`, {
//   //       params: {
//   //         limit: LINE_ITEMS_LIMIT,
//   //         offset,
//   //         ...(isMulti && selectedCpKey ? { cp_key: selectedCpKey } : {}),
//   //       },
//   //       withCredentials: true,
//   //     });

//   //     if (closingRef.current) return;

//   //     const { results = [], count = 0 } = res.data || {};

//   //     // count — истина
//   //     setLineItemsTotal(count);

//   //     // loaded — без дублей (на случай гонок/повторов)
//   //     setLineItemsLoaded(prev => {
//   //       const next = append ? [...prev, ...results] : results;

//   //       const map = new Map();
//   //       for (const x of next) map.set(String(x.id), x);

//   //       return Array.from(map.values());
//   //     });

//   //     // offset считаем от фактически добавленного количества
//   //     setLineItemsOffset(prev => (append ? prev + results.length : results.length));
//   //   } catch (e) {
//   //     console.error("Failed to load line items:", e);
//   //   } finally {
//   //     lineItemsReqLockRef.current = false;
//   //     if (!closingRef.current) {
//   //       setLineItemsLoading(false);
//   //       setLineItemsLoadingMore(false);
//   //     }
//   //   }
//   // }, []);

//   const loadMoreLineItems = useCallback(() => {
//     if (closingRef.current) return;
//     if (!selected?.id) return;

//     // если уже всё загрузили — стоп
//     if (lineItemsOffset >= lineItemsTotal) return;

//     loadLineItems(selected.id, lineItemsOffset, true);
//   }, [selected?.id, lineItemsOffset, lineItemsTotal, loadLineItems]);

//   const handleClose = useCallback(() => {
//     // 1) моментально убираем тяжелое из DOM
//     setClosing(true);
//     setAccordionExpanded(false);

//     // 2) прерываем запросы (если есть)
//     abortRef.current?.abort();
//     abortRef.current = null;

//     // 3) закрываем диалог сразу
//     onClose();

//     // 4) тяжелые сбросы уже после закрытия (не мешают клику)
//     setTimeout(() => {
//       setLineItemsLoaded([]);
//       setLineItemsOffset(0);
//       setLineItemsTotal(0);
//       setLineItemsLoading(false);
//       setLocalPreview(null);
//       prevDocId.current = null;

//       setClosing(false);
//     }, 0);
//   }, [onClose]);

//   const refreshDocument = async (id) => {
//     if (abortRef.current) abortRef.current.abort();
//     const controller = new AbortController();
//     abortRef.current = controller;
//     const reqId = ++lastReqIdRef.current;

//     if (isMulti) {
//       setPreviewLoading(true);
//       setLocalPreview(prev => ({
//         ...(prev || {}),
//         pirkimas_pardavimas_code: optimisticDirection,
//         pirkimas_pardavimas_label: ppText(optimisticDirection),
//         pvm_kodas: prev?.pvm_kodas ?? null,
//         pvm_kodas_label: prev?.pvm_kodas_label ?? (selectedCpKey ? "—" : "Pasirinkite kontrahentą"),
//         line_items: prev?.line_items || [],
//       }));
//     }

//     try {
//       const res = await api.get(`/documents/${id}/`, {
//         withCredentials: true,
//         signal: controller.signal,
//         params: (isMulti && selectedCpKey) ? { cp_key: selectedCpKey } : {},
//       });

//       if (reqId !== lastReqIdRef.current) return;

//       setSelected(res.data);
//       setDocs(prev => prev.map(d => sameId(d.id, id) ? res.data : d));

//       // Update line items total count
//       setLineItemsTotal(res.data.line_items_count || 0);

//       if (isMulti) {
//         if (selectedCpKey) {
//           setLocalPreview(res.data.preview || null);
//         } else {
//           const pv = res.data.preview || {};
//           setLocalPreview({
//             ...pv,
//             pirkimas_pardavimas_code: null,
//             pirkimas_pardavimas_label: "Pasirinkite kontrahentą",
//             pvm_kodas: null,
//             pvm_kodas_label: "Pasirinkite kontrahentą",
//             line_items: Array.isArray(pv.line_items) ? pv.line_items.map(li => ({
//               ...li,
//               pvm_kodas: null,
//               pvm_kodas_label: "Pasirinkite kontrahentą",
//             })) : [],
//           });
//         }
//       }
//     } catch (e) {
//     } finally {
//       if (reqId === lastReqIdRef.current) setPreviewLoading(false);
//     }
//   };

//   useEffect(() => {
//     const container = lineItemsContainerRef.current;
//     if (!container || !accordionExpanded || closingRef.current) return;

//     const handleScroll = () => {
//       if (closingRef.current) return;
//       if (lineItemsLoading) return;
//       if (lineItemsLoaded.length >= lineItemsTotal) return;

//       const { scrollTop, scrollHeight, clientHeight } = container;
//       if (scrollHeight - scrollTop - clientHeight < 200) {
//         loadMoreLineItems();
//       }
//     };

//     container.addEventListener("scroll", handleScroll);
//     return () => container.removeEventListener("scroll", handleScroll);
//   }, [
//     accordionExpanded,
//     loadMoreLineItems,
//     lineItemsLoading,
//     lineItemsLoaded.length,
//     lineItemsTotal,
//     selected?.id,
//   ]);


//   // Reset line items state when document changes
//   useEffect(() => {
//     if (open && selected?.id && !String(selected.id).startsWith("temp-") && prevDocId.current !== selected.id) {
//       setLocalPreview(null);
//       setLineItemsLoaded([]);
//       setLineItemsOffset(0);
//       setLineItemsTotal(0);
//       setAccordionExpanded(false);
//       refreshDocument(selected.id);
//       prevDocId.current = selected.id;
//     }
//   }, [open, selected?.id]);

//   useEffect(() => {
//     if (open && isMulti && selected?.id) {
//       refreshDocument(selected.id);
//     }
//   }, [selectedCpKey]);

//   // УБРАН useEffect со scroll addEventListener - используем onItemsRendered в List

//   const programKey = user?.default_accounting_program;
//   const extraFields = programKey ? (EXTRA_FIELDS_CONFIG[programKey] || []) : [];

//   const hasAnyCounterparty =
//     !!(selected?.buyer_id || selected?.buyer_vat_code || selected?.buyer_name) ||
//     !!(selected?.seller_id || selected?.seller_vat_code || selected?.seller_name);

//   const ppLabel = isMulti
//     ? (selectedCpKey
//         ? (localPreview?.pirkimas_pardavimas_label || (hasAnyCounterparty ? "—" : "Pasirinkite kontrahentą"))
//         : "Pasirinkite kontrahentą")
//     : (selected?.pirkimas_pardavimas === "pirkimas"
//         ? "Pirkimas"
//         : selected?.pirkimas_pardavimas === "pardavimas"
//           ? "Pardavimas"
//           : "—");

//   const pvmLabel = isMulti
//     ? (selectedCpKey
//         ? (localPreview?.pvm_kodas_label || (hasAnyCounterparty ? (previewLoading ? "Skaičiuojama…" : "—") : "Pasirinkite kontrahentą"))
//         : "Pasirinkite kontrahentą")
//     : (selected?.pvm_kodas || "—");

//   const previewLinePvmById = (lineId) => {
//     const arr = localPreview?.line_items || [];
//     const hit = arr.find(li => String(li.id) === String(lineId));
//     return hit?.pvm_kodas_label || hit?.pvm_kodas || null;
//   };

//   const handleClientSelect = (type) => async (valueObj) => {
//     if (!valueObj || !selected?.id) return;

//     const data = type === "buyer"
//       ? {
//           buyer_name: valueObj.pavadinimas,
//           buyer_id: valueObj.imones_kodas,
//           buyer_vat_code: valueObj.pvm_kodas,
//           buyer_iban: valueObj.ibans,
//           buyer_address: valueObj.address,
//           buyer_country_iso: valueObj.country_iso,
//         }
//       : {
//           seller_name: valueObj.pavadinimas,
//           seller_id: valueObj.imones_kodas,
//           seller_vat_code: valueObj.pvm_kodas,
//           seller_iban: valueObj.ibans,
//           seller_address: valueObj.address,
//           seller_country_iso: valueObj.country_iso,
//         };

//     const res = await api.patch(
//       `/scanned-documents/${selected.id}/extra-fields/`,
//       data,
//       { withCredentials: true }
//     );

//     setSelected(res.data);
//     setDocs(prev => prev.map(d => sameId(d.id, selected.id) ? res.data : d));

//     if (isMulti) {
//       await refreshDocument(selected.id);
//     }
//   };

//   function formatNumberPreview(value) {
//     if (value === null || value === undefined || value === "") return "—";
//     let num = Number(value);
//     if (isNaN(num)) return value;

//     let [int, dec = ""] = num.toFixed(4).split(".");
//     if (dec.length < 4) dec = dec.padEnd(4, "0");

//     if (dec[2] === "0" && dec[3] === "0") {
//       return `${int}.${dec.slice(0, 2)}`;
//     }
//     return `${int}.${dec}`;
//   }

//   const handleClientClear = (type) => async () => {
//     if (!selected?.id) return;

//     const data = type === "buyer"
//       ? {
//           buyer_name: "",
//           buyer_id: "",
//           buyer_vat_code: "",
//           buyer_iban: "",
//           buyer_address: "",
//           buyer_country_iso: "",
//           apply_defaults: false,
//         }
//       : {
//           seller_name: "",
//           seller_id: "",
//           seller_vat_code: "",
//           seller_iban: "",
//           seller_address: "",
//           seller_country_iso: "",
//           apply_defaults: false,
//         };

//     const res = await api.patch(
//       `/scanned-documents/${selected.id}/extra-fields/`,
//       data,
//       { withCredentials: true }
//     );
//     setSelected(res.data);
//     setDocs(prev => prev.map(d => sameId(d.id, selected.id) ? res.data : d));

//     if (isMulti) {
//       await refreshDocument(selected.id);
//     }
//   };

//   const handleProductSelect = async (valueObj) => {
//     if (!valueObj || !selected?.id) return;
//     const data = {
//       prekes_kodas: valueObj.prekes_kodas || valueObj.code || "",
//       prekes_pavadinimas: valueObj.prekes_pavadinimas || valueObj.name || "",
//       prekes_barkodas: valueObj.prekes_barkodas || valueObj.barkodas || valueObj.barcode || "",
//     };

//     const res = await api.patch(
//       `/scanned-documents/${selected.id}/extra-fields/`,
//       data,
//       { withCredentials: true }
//     );
//     setSelected(res.data);
//     setDocs(prev => prev.map(d => sameId(d.id, res.data.id) ? res.data : d));

//     if (isMulti) {
//       await refreshDocument(selected.id);
//     }
//   };

//   const handleProductClear = async () => {
//     if (!selected?.id) return;

//     const res = await api.post(
//       `/scanned-documents/${selected.id}/clear-product/`,
//       {},
//       { withCredentials: true }
//     );

//     setSelected(res.data);
//     setDocs(prev => prev.map(d => sameId(d.id, res.data.id) ? res.data : d));

//     if (isMulti) {
//       await refreshDocument(selected.id);
//     }
//   };

//   const handleLineItemProductSelect = (lineItemId) => async (valueObj) => {
//     if (!valueObj || !selected?.id) return;
//     const data = {
//       prekes_kodas: valueObj.prekes_kodas || valueObj.code || "",
//       prekes_pavadinimas: valueObj.prekes_pavadinimas || valueObj.name || "",
//       prekes_barkodas: valueObj.prekes_barkodas || valueObj.barkodas || valueObj.barcode || "",
//     };

//     const res = await api.patch(
//       `/scanned-documents/${selected.id}/lineitem/${lineItemId}/`,
//       data,
//       { withCredentials: true }
//     );

//     // Update in loaded line items
//     setLineItemsLoaded(prev =>
//       prev.map(li => sameId(li.id, lineItemId) ? { ...li, ...res.data } : li)
//     );

//     setSelected(prev => ({
//       ...prev,
//       line_items_count: prev.line_items_count,
//     }));

//     setDocs(prev =>
//       prev.map(d =>
//         sameId(d.id, selected.id) ? { ...d } : d
//       )
//     );

//     if (isMulti) {
//       await refreshDocument(selected.id);
//     }
//   };

//   const handleLineItemProductClear = (lineItemId) => async () => {
//     if (!selected?.id || !lineItemId) return;

//     const res = await api.post(
//       `/scanned-documents/${selected.id}/lineitem/${lineItemId}/clear-product/`,
//       {},
//       { withCredentials: true }
//     );

//     // Update in loaded line items
//     setLineItemsLoaded(prev =>
//       prev.map(li => sameId(li.id, lineItemId) ? { ...li, ...res.data } : li)
//     );

//     if (isMulti) {
//       await refreshDocument(selected.id);
//     }
//   };

//   const gluedRawText = useMemo(() => {
//     const v = selected?.glued_raw_text;
//     return typeof v === "string" ? v : (v == null ? "" : String(v));
//   }, [selected]);

//   const gptRawPretty = useMemo(() => {
//     const raw = selected?.gpt_raw_json;
//     if (raw == null) return "";
//     try {
//       const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
//       return JSON.stringify(obj, null, 2);
//     } catch {
//       return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
//     }
//   }, [selected]);

//   const structuredPretty = useMemo(() => {
//     const raw = selected?.structured_json;
//     if (raw == null) return "";
//     try {
//       const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
//       return JSON.stringify(obj, null, 2);
//     } catch {
//       return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
//     }
//   }, [selected]);

//   const copyToClipboard = async (text) => {
//     try { await navigator.clipboard.writeText(text || ""); } catch {}
//   };

//   const PRODUCT_FIELDS = [
//     { field: "prekes_pavadinimas", label: "Prekės pavadinimas:" },
//     { field: "prekes_kodas", label: "Prekės kodas:" },
//     { field: "prekes_barkodas", label: "Prekės barkodas:" },
//   ];

//   const accordionRef = useRef(null);

//   const handleAccordionChange = (event, expanded) => {
//     setAccordionExpanded(expanded);

//     if (!expanded) {
//       setLineItemsLoaded([]);
//       setLineItemsOffset(0);
//       return;
//     }

//     // открыли: всегда стартуем с нуля
//     setLineItemsLoaded([]);
//     setLineItemsOffset(0);

//     if (selected?.id && (selected?.line_items_count > 0 || lineItemsTotal > 0)) {
//       loadLineItems(selected.id, 0, false);
//     }

//     if (accordionRef.current) {
//       setTimeout(() => {
//         accordionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
//       }, 200);
//     }
//   };

//   if (!selected) return null;

//   const CURRENCIES = [
//     "EUR","USD","GBP",
//     "AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN","BAM","BBD","BDT","BGN","BHD",
//     "BIF","BMD","BND","BOB","BOV","BRL","BSD","BTN","BWP","BYN","BZD","CAD","CDF","CHE","CHF",
//     "CHW","CLF","CLP","CNY","COP","COU","CRC","CUC","CUP","CVE","CZK","DJF","DKK","DOP","DZD",
//     "EGP","ERN","ETB","FJD","FKP","GEL","GHS","GIP","GMD","GNF","GTQ","GYD","HKD","HNL","HRK",
//     "HTG","HUF","IDR","ILS","INR","IQD","IRR","ISK","JMD","JOD","JPY","KES","KGS","KHR","KMF",
//     "KPW","KRW","KWD","KYD","KZT","LAK","LBP","LKR","LRD","LSL","LYD","MAD","MDL","MGA","MKD",
//     "MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MXV","MYR","MZN","NAD","NGN","NIO","NOK",
//     "NPR","NZD","OMR","PAB","PEN","PGK","PHP","PKR","PLN","PYG","QAR","RON","RSD","RUB","RWF",
//     "SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLE","SLL","SOS","SRD","SSP","STN","SVC","SZL",
//     "THB","TJS","TMT","TND","TOP","TRY","TTD","TWD","TZS","UAH","UGX","USN","UYI","UYU","UZS",
//     "VED","VEF","VND","VUV","WST","XAF","XAG","XAU","XBA","XBB","XBC","XBD","XCD","XDR","XOF",
//     "XPD","XPF","XPT","XSU","XUA","YER","ZAR","ZMW","ZWL"
//   ];
//   const TAIP_NE = [{ label:"Taip", value:true }, { label:"Ne", value:false }];

//   const ensureDate = (v) => {
//     if (v == null || v === "") return null;
//     const s = String(v).trim();
//     if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Formatas: YYYY-MM-DD");
//     return s;
//   };
//   const ensureNumber = (v) => {
//     if (v == null || v === "") return null;
//     const n = Number(v);
//     if (Number.isNaN(n)) throw new Error("Turi būti skaičius");
//     return n;
//   };

//   const normVal = (v) => {
//     if (v === "" || v === undefined) return null;
//     if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
//     return v;
//   };

//   const saveDocFields = async (patchOrField, maybeValue) => {
//     if (!selected?.id) return;

//     const updates = Array.isArray(patchOrField)
//       ? patchOrField
//       : (typeof patchOrField === "object" && patchOrField !== null)
//         ? Object.entries(patchOrField)
//         : [[patchOrField, maybeValue]];

//     let latestSelected = selected;

//     for (const [field, raw] of updates) {
//       const value = normVal(raw);
//       const res = await api.patch(
//         `/scanned-documents/${latestSelected.id}/inline/`,
//         { field, value },
//         { withCredentials: true }
//       );

//       latestSelected = { 
//         ...latestSelected, 
//         [field]: res.data[field],
//         ...(res.data.ready_for_export !== undefined && { 
//           ready_for_export: res.data.ready_for_export 
//         }),
//         ...(res.data.math_validation_passed !== undefined && { 
//           math_validation_passed: res.data.math_validation_passed 
//         })
//       };
//     }

//     setSelected(latestSelected);
//     setDocs(prev => prev.map(d => (String(d.id) === String(latestSelected.id) ? latestSelected : d)));

//     if (isMulti) await refreshDocument(latestSelected.id);
//   };

//   const saveLineFields = async (lineId, patchOrField, maybeValue) => {
//     if (!selected?.id || !lineId) return;

//     const updates = Array.isArray(patchOrField)
//       ? patchOrField
//       : (typeof patchOrField === "object" && patchOrField !== null)
//         ? Object.entries(patchOrField)
//         : [[patchOrField, maybeValue]];

//     let changed = {};
//     let mathValidationResult = null;

//     for (const [field, raw] of updates) {
//       const value = normVal(raw);
//       const res = await api.patch(
//         `/scanned-documents/${selected.id}/lineitem/${lineId}/inline/`,
//         { field, value },
//         { withCredentials: true }
//       );
//       changed[field] = res.data[field];
      
//       if (res.data.math_validation_passed !== undefined) {
//         mathValidationResult = res.data.math_validation_passed;
//       }
//     }

//     // Update in loaded line items
//     setLineItemsLoaded(prev =>
//       prev.map(li => String(li.id) === String(lineId) ? { ...li, ...changed } : li)
//     );

//     setSelected(prev => ({
//       ...prev,
//       ...(mathValidationResult !== null && { 
//         math_validation_passed: mathValidationResult 
//       })
//     }));

//     setDocs(prev => prev.map(d =>
//       String(d.id) === String(selected.id)
//         ? {
//             ...d,
//             ...(mathValidationResult !== null && { 
//               math_validation_passed: mathValidationResult 
//             })
//           }
//         : d
//     ));

//     if (isMulti) await refreshDocument(selected.id);
//   };

//   const addLineItem = async () => {
//     if (!selected?.id) return;
//     const res = await api.post(`/scanned-documents/${selected.id}/add-lineitem/`, {}, { withCredentials: true });
//     const newItem = res.data;

//     // Add to loaded line items
//     setLineItemsLoaded(prev => [...prev, newItem]);
//     setLineItemsTotal(prev => prev + 1);

//     setSelected(prev => ({
//       ...prev,
//       line_items_count: (prev.line_items_count || 0) + 1,
//     }));

//     setDocs(prev =>
//       prev.map(d =>
//         String(d.id) === String(selected.id)
//           ? { ...d, line_items_count: (d.line_items_count || 0) + 1 }
//           : d
//       )
//     );

//     // Скролл к последнему элементу через List ref
//     setTimeout(() => {
//       const el = lineItemsContainerRef.current;
//       if (el) el.scrollTop = el.scrollHeight;
//     }, 0);
//   };

//   const deleteLineItem = async (lineId) => {
//     if (!selected?.id) return;
//     const currentCount = lineItemsLoaded.length;
//     if (currentCount <= 1) {
//       window.alert("Negalima ištrinti vienintelės eilutės.");
//       return;
//     }

//     const confirmed = window.confirm("Ar tikrai norite ištrinti prekę?");
//     if (!confirmed) return;

//     await api.delete(`/scanned-documents/${selected.id}/delete-lineitem/${lineId}/`, { withCredentials: true });

//     // Remove from loaded line items
//     setLineItemsLoaded(prev => prev.filter(li => li.id !== lineId));
//     setLineItemsTotal(prev => prev - 1);
//     setLineItemsOffset(prev => Math.max(0, prev - 1));

//     setSelected(prev => ({
//       ...prev,
//       line_items_count: Math.max(0, (prev.line_items_count || 1) - 1),
//     }));

//     setDocs(prev =>
//       prev.map(d =>
//         String(d.id) === String(selected.id)
//           ? { ...d, line_items_count: Math.max(0, (d.line_items_count || 1) - 1) }
//           : d
//       )
//     );
//   };

//   const renderValidationFlags = () => {
//     const readyForExport = selected?.ready_for_export;
//     const mathValidation = selected?.math_validation_passed;

//     return (
//       <Box sx={{ mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
//         <Chip
//           icon={
//             readyForExport === true ? <CheckCircleIcon /> :
//             readyForExport === false ? <ErrorIcon /> :
//             <HourglassEmptyIcon />
//           }
//           label={
//             readyForExport === true ? "Paruošta eksportui" :
//             readyForExport === false ? "Trūksta duomenų" :
//             "Laukiama patvirtinimo"
//           }
//           color={
//             readyForExport === true ? "success" :
//             readyForExport === false ? "error" :
//             "default"
//           }
//           variant={readyForExport === null ? "outlined" : "filled"}
//           size="small"
//         />

//         <Chip
//           icon={
//             mathValidation === true ? <CheckCircleIcon /> :
//             mathValidation === false ? <ErrorIcon /> :
//             <HourglassEmptyIcon />
//           }
//           label={
//             mathValidation === true ? "Sumos sutampa" :
//             mathValidation === false ? "Sumos nesutampa" :
//             "Laukiama patikrinimo"
//           }
//           color={
//             mathValidation === true ? "success" :
//             mathValidation === false ? "warning" :
//             "default"
//           }
//           variant={mathValidation === null ? "outlined" : "filled"}
//           size="small"
//         />
//       </Box>
//     );
//   };

//   const lineItemsCount = (lineItemsTotal ?? selected?.line_items_count ?? 0);

//   const headerLoading = accordionExpanded && lineItemsLoading;

//   // Проверка: separate_vat для отображения "Keli skirtingi PVM %"
//   const hasSeparateVat = selected?.separate_vat === true;
//   const separateVatLabel = "Keli skirtingi PVM %";

//   return (
//     <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
//       <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth TransitionProps={{ timeout: 0.1 }}>
//         <DialogTitle
//           sx={{
//             fontWeight: 500,
//             fontSize: 18,
//             pr: 5,
//             pb: 1,
//             position: "relative",
//             minHeight: 44,
//           }}
//         >
//           Peržiūra
//           <IconButton
//             aria-label="close"
//             onClick={handleClose}
//             sx={{
//               position: 'absolute',
//               right: 10,
//               top: 8,
//               zIndex: 2000,
//               color: (theme) => theme.palette.grey[500],
//               p: 1,
//             }}
//           >
//             <CloseIcon />
//           </IconButton>
//         </DialogTitle>
//         <DialogContent
//           dividers
//           sx={{
//             display: "flex",
//             gap: 4,
//             fontSize: 15,
//             '*': { fontSize: "inherit" },
//             minHeight: 400,
//             maxHeight: "80vh",
//             overflow: "auto",
//             pointerEvents: closing ? "none" : "auto",
//           }}
//         >
//           <Box
//             width="50%"
//             sx={{
//               position: "sticky",
//               top: 12,
//               alignSelf: "flex-start",
//               maxHeight: "75vh",
//               minHeight: 320,
//               display: "flex",
//               alignItems: "center",
//               justifyContent: "center",
//               bgcolor: "#fff",
//               borderRadius: 2,
//               border: "1px solid #eee",
//               p: 2,
//               boxShadow: "0 2px 8px #0001",
//             }}
//           >
//             {selected.preview_url ? (
//               <ZoomableImage src={selected.preview_url} />
//             ) : (
//               <Typography color="text.secondary">Peržiūra negalima</Typography>
//             )}
//           </Box>

//           <Box width="50%" sx={{ px: 0.5 }}>
//             {selected.error_message ? (
//               <Typography color="error">{selected.error_message}</Typography>
//             ) : (
//               <>
//                 {renderValidationFlags()}

//                 <Typography gutterBottom>
//                   Pirkimas/pardavimas:&nbsp;
//                   <b>{ppLabel}{isMulti && previewLoading ? "…" : ""}</b>
//                 </Typography>

//                 <Typography gutterBottom>
//                   Dokumento tipas: <b>{selected.document_type || "—"}</b>
//                 </Typography>
//                 <Divider sx={{ my: 1 }} />

//                 <Grid2 container spacing={2} sx={{ mb: 2 }}>
//                   <Grid2 size={6}>
//                     <Typography sx={{ mb: 1.5, fontWeight: 500, fontSize: "0.95rem", display: 'flex', alignItems: 'center', gap: 0.5 }}>
//                       Pirkėjas
//                       <SwapBuyerSellerButton 
//                         documentId={selected?.id}
//                         sellerName={selected?.seller_name}
//                         buyerName={selected?.buyer_name}
//                         onSwapComplete={async (data) => {
//                           setSelected(prev => ({
//                             ...prev,
//                             seller_name: data.seller_name,
//                             buyer_name: data.buyer_name,
//                           }));
//                           setDocs(prev => prev.map(d => 
//                             String(d.id) === String(selected.id) 
//                               ? { ...d, seller_name: data.seller_name, buyer_name: data.buyer_name }
//                               : d
//                           ));
//                           await refreshDocument(selected.id);
//                         }}
//                       />
//                     </Typography>
//                     {["buyer_name", "buyer_id", "buyer_vat_code"].map((field) => {
//                       const isVatField = field === "buyer_vat_code";
//                       const vatMeta = isVatField ? mapVatStatus(selected?.buyer_vat_val) : null;

//                       return (
//                         <Box key={field} sx={{ mb: 1 }}>
//                           <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
//                             <Typography variant="caption" color="text.secondary">
//                               {EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.label ||
//                                 field}
//                             </Typography>
//                             {isVatField && vatMeta && (
//                               <Chip
//                                 icon={vatMeta.icon}
//                                 label={vatMeta.label}
//                                 color={vatMeta.color}
//                                 size="small"
//                                 sx={{
//                                   height: 18,
//                                   fontSize: "0.7rem",
//                                   "& .MuiChip-label": { px: 0.5, pr: 1 },
//                                   "& .MuiChip-icon": { fontSize: "0.9rem", ml: 0.5, mr: 0.025 },
//                                 }}
//                               />
//                             )}
//                           </Box>
//                           <EditableAutoCell
//                             fieldName={field}
//                             label={
//                               EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.label ||
//                               "Pasirinkite…"
//                             }
//                             value={selected[field] || ""}
//                             searchUrl={EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.search}
//                             onSelect={handleClientSelect("buyer")}
//                             onManualSave={async (text) => {
//                               if (!selected?.id) return;
//                               const res = await api.patch(
//                                 `/scanned-documents/${selected.id}/extra-fields/`,
//                                 { [field]: text || null },
//                                 { withCredentials: true }
//                               );
//                               setSelected(res.data);
//                               setDocs((prev) =>
//                                 prev.map((d) =>
//                                   String(d.id) === String(selected.id) ? res.data : d
//                                 )
//                               );
//                               if (isMulti) await refreshDocument(selected.id);
//                             }}
//                             onClear={async () => {
//                               await handleClientClear("buyer")();
//                             }}
//                             sx={{
//                               width: "100%",
//                               "& .MuiInputBase-root": {
//                                 fontSize: "0.875rem",
//                               },
//                               "& input": {
//                                 fontSize: "0.875rem",
//                               },
//                             }}
//                           />
//                         </Box>
//                       );
//                     })}
//                   </Grid2>

//                   <Grid2 size={6}>
//                     <Typography sx={{ mb: 1.5, fontWeight: 500, fontSize: "0.95rem" }}>
//                       Pardavėjas
//                     </Typography>
//                     {["seller_name", "seller_id", "seller_vat_code"].map((field) => {
//                       const isVatField = field === "seller_vat_code";
//                       const vatMeta = isVatField ? mapVatStatus(selected?.seller_vat_val) : null;

//                       const fieldNameForAuto = field.includes("_name")
//                         ? "prekes_pavadinimas"
//                         : field.includes("_id")
//                         ? "prekes_kodas"
//                         : "prekes_barkodas";

//                       return (
//                         <Box key={field} sx={{ mb: 1 }}>
//                           <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
//                             <Typography variant="caption" color="text.secondary">
//                               {EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.label ||
//                                 field}
//                             </Typography>
//                             {isVatField && vatMeta && (
//                               <Chip
//                                 icon={vatMeta.icon}
//                                 label={vatMeta.label}
//                                 color={vatMeta.color}
//                                 size="small"
//                                 sx={{
//                                   height: 18,
//                                   fontSize: "0.7rem",
//                                   "& .MuiChip-label": { px: 0.5, pr: 1 },
//                                   "& .MuiChip-icon": { fontSize: "0.9rem", ml: 0.5, mr: 0.025 },
//                                 }}
//                               />
//                             )}
//                           </Box>
//                           <EditableAutoCell
//                             fieldName={fieldNameForAuto}
//                             label={
//                               EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.label ||
//                               "Pasirinkite…"
//                             }
//                             value={selected[field] || ""}
//                             searchUrl={EXTRA_FIELDS_CONFIG.client.find((f) => f.name === field)?.search}
//                             onSelect={handleClientSelect("seller")}
//                             onManualSave={async (text) => {
//                               if (!selected?.id) return;
//                               const res = await api.patch(
//                                 `/scanned-documents/${selected.id}/extra-fields/`,
//                                 { [field]: text || null },
//                                 { withCredentials: true }
//                               );
//                               setSelected(res.data);
//                               setDocs((prev) =>
//                                 prev.map((d) =>
//                                   String(d.id) === String(selected.id) ? res.data : d
//                                 )
//                               );
//                               if (isMulti) await refreshDocument(selected.id);
//                             }}
//                             onClear={async () => {
//                               await handleClientClear("seller")();
//                             }}
//                             sx={{
//                               width: "100%",
//                               "& .MuiInputBase-root": {
//                                 fontSize: "0.875rem",
//                               },
//                               "& input": {
//                                 fontSize: "0.875rem",
//                               },
//                             }}
//                           />
//                         </Box>
//                       );
//                     })}
//                   </Grid2>
//                 </Grid2>


//                 <Divider sx={{ my: 1 }} />

//                 <Stack spacing={0.5} mt={1} mb={1}>
//                   <Typography>Sąskaitos data: <EditableCell value={selected.invoice_date} inputType="date" onSave={(v) => saveDocFields("invoice_date", ensureDate(v))} /></Typography>
//                   <Typography>Mokėti iki: <EditableCell value={selected.due_date} inputType="date" onSave={(v) => saveDocFields("due_date", ensureDate(v))} /></Typography>
//                   <Typography>Operacijos data: <EditableCell value={selected.operation_date} inputType="date" onSave={(v) => saveDocFields("operation_date", ensureDate(v))} /></Typography>
//                   <Typography>Sąskaitos serija: <EditableCell value={selected.document_series} onSave={(v) => saveDocFields("document_series", v)} /></Typography>
//                   <Typography>Sąskaitos numeris: <EditableCell value={selected.document_number} onSave={(v) => saveDocFields("document_number", v)} /></Typography>
//                   <Typography>Užsakymo numeris: <EditableCell value={selected.order_number} onSave={(v) => saveDocFields("order_number", v)} /></Typography>
//                   <Typography>Nuolaida sąskaitai (be PVM): <EditableCell value={selected.invoice_discount_wo_vat} inputType="number" onSave={(v) => saveDocFields("invoice_discount_wo_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//                   <Typography>Nuolaida sąskaitai (su PVM): <EditableCell value={selected.invoice_discount_with_vat} inputType="number" onSave={(v) => saveDocFields("invoice_discount_with_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//                   <Typography>Suma (be PVM): <EditableCell value={selected.amount_wo_vat} inputType="number" onSave={(v) => saveDocFields("amount_wo_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//                   <Typography>PVM: <EditableCell value={selected.vat_amount} inputType="number" onSave={(v) => saveDocFields("vat_amount", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                  
//                   {/* PVM % — если separate_vat, показываем текст и не даём редактировать */}
//                   <Typography>
//                     PVM %:{" "}
//                     {hasSeparateVat ? (
//                       <b>{separateVatLabel}</b>
//                     ) : (
//                       <EditableCell 
//                         value={selected.vat_percent} 
//                         inputType="number" 
//                         onSave={(v) => saveDocFields("vat_percent", ensureNumber(v))} 
//                         renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} 
//                       />
//                     )}
//                   </Typography>
                  
//                   {/* PVM klasė — если separate_vat, показываем тот же текст */}
//                   <Typography>
//                     PVM klasė:{" "}
//                     {hasSeparateVat ? (
//                       <b>{separateVatLabel}</b>
//                     ) : (
//                       <b>{pvmLabel}{isMulti && previewLoading ? "…" : ""}</b>
//                     )}
//                   </Typography>
                  
//                   <Typography>Suma (su PVM): <EditableCell value={selected.amount_with_vat} inputType="number" onSave={(v) => saveDocFields("amount_with_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
//                   <Typography>Valiuta: <EditableCell
//                     value={selected.currency}
//                     inputType="select"
//                     options={CURRENCIES}
//                     onSave={(v)=>saveDocFields("currency", v)}
//                   /></Typography>

//                   <Typography>Mokėta grynais: <EditableCell
//                     value={selected.paid_by_cash}
//                     inputType="select"
//                     options={TAIP_NE}
//                     getOptionLabel={(o)=>o.label}
//                     onSave={(v)=>saveDocFields("paid_by_cash", v)}
//                     renderDisplay={(v)=> (v===true ? "Taip" : v===false ? "Ne" : "—")}
//                   /></Typography>

//                   {selected.scan_type === "sumiskai" && (
//                     <Grid2 container spacing={2} sx={{ mb: 2 }}>
//                       <Grid2 xs={12}>
//                         {PRODUCT_FIELDS.map(({ field, label }) => {
//                           const cfg = EXTRA_FIELDS_CONFIG.product.find(f => f.name === field);

//                           return (
//                             <Stack
//                               key={field}
//                               direction="row"
//                               alignItems="center"
//                               spacing={1}
//                               sx={{ mb: 1 }}
//                             >
//                               <Typography color="text.secondary" sx={{ minWidth: 130, color: "black" }}>
//                                 {label}
//                               </Typography>

//                               <EditableAutoCell
//                                 label={label}
//                                 value={selected[field] || ""}
//                                 searchUrl={cfg?.search}
//                                 onSelect={handleProductSelect}
//                                 onManualSave={(text) =>
//                                   saveDocFields({ [field]: text || null })
//                                 }
//                                 onClear={() => handleProductClear()}
//                                 sx={{
//                                   flex: 1,
//                                   "& .MuiInputBase-root": {
//                                     minHeight: "28px",
//                                     background: "transparent",
//                                     fontSize: "inherit",
//                                     px: 1,
//                                   },
//                                   "& input": {
//                                     padding: 0,
//                                     fontSize: "inherit",
//                                   },
//                                 }}
//                               />
//                             </Stack>
//                           );
//                         })}
//                       </Grid2>
//                     </Grid2>
//                   )}
//                 </Stack>

//                 {selected.scan_type === "detaliai" && lineItemsCount > 0 && (
//                   <Accordion 
//                     expanded={!closing && accordionExpanded}
//                     onChange={handleAccordionChange} 
//                     ref={accordionRef}
//                     sx={{ mt: 1, background: "#fafafa" }}
//                   >
//                     <AccordionSummary expandIcon={<ExpandMoreIcon />}>
//                       <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
//                         <Typography>
//                           Prekė(s): {lineItemsCount} {ltEilutes(lineItemsCount)}
//                         </Typography>

//                         {/* loader только справа от текста */}
//                         {headerLoading && (
//                           <CircularProgress
//                             size={26}        // было 16 — сделай 20-24
//                             thickness={8}    // "жирность" круга (по умолчанию 3.6)
//                             sx={{ ml: 1 }}
//                           />
//                         )}
//                       </Box>
//                     </AccordionSummary>
//                     <AccordionDetails>
//                       <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
//                         <Button
//                           variant="outlined"
//                           size="small"
//                           color="primary"
//                           onClick={addLineItem}
//                         >
//                           + Pridėti eilutę
//                         </Button>
//                       </Box>
                      
//                       {!closing && accordionExpanded && (
//                         <Box
//                           ref={lineItemsContainerRef}
//                           sx={{ maxHeight: 500, overflowY: "auto", pr: 1 }}
//                         >
//                           {lineItemsLoaded.map((item, index) => {
//                             const canDelete = lineItemsLoaded.length > 1;
//                             const previewLinePvm = isMulti
//                               ? (item.pvm_kodas_label || item.pvm_kodas || (previewLoading ? "Skaičiuojama…" : "—"))
//                               : (item.pvm_kodas || item.vat_class || "—");

//                             return (
//                               <LineItemCard
//                                 key={item.id}
//                                 item={item}
//                                 index={index}
//                                 canDelete={canDelete}
//                                 previewLinePvm={previewLinePvm}
//                                 onDelete={deleteLineItem}
//                                 onProductSelect={handleLineItemProductSelect}
//                                 onProductClear={handleLineItemProductClear}
//                                 onSaveFields={saveLineFields}
//                                 formatNumberPreview={formatNumberPreview}
//                                 PRODUCT_FIELDS={PRODUCT_FIELDS}
//                                 EXTRA_FIELDS_CONFIG={EXTRA_FIELDS_CONFIG}
//                               />
//                             );
//                           })}

//                           {accordionExpanded && lineItemsLoading && lineItemsLoaded.length === 0 && (
//                             <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
//                               <CircularProgress size={24} />
//                             </Box>
//                           )}

//                           {!lineItemsLoading && lineItemsLoaded.length === 0 && lineItemsTotal === 0 && (
//                             <Typography color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
//                               Nėra prekių
//                             </Typography>
//                           )}

//                           {lineItemsLoaded.length > 0 && lineItemsLoaded.length < lineItemsTotal && (
//                             <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
//                               <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
//                                 <Button
//                                   onClick={loadMoreLineItems}
//                                   variant="text"
//                                   disabled={lineItemsLoadingMore}
//                                   sx={{ minHeight: 36 }}
//                                 >
//                                   Įkelti daugiau ({lineItemsTotal - lineItemsLoaded.length} liko)
//                                 </Button>

//                                 {lineItemsLoadingMore && (
//                                   <CircularProgress size={26} thickness={8} />
//                                 )}
//                               </Box>
//                             </Box>
//                           )}
//                         </Box>
//                       )}          
                      
//                       {!closing && accordionExpanded && lineItemsLoading && lineItemsLoaded.length === 0 && (
//                         <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
//                           <CircularProgress size={28} thickness={5} />
//                         </Box>
//                       )}
                      
//                       {!closing && accordionExpanded && !lineItemsLoading && lineItemsLoaded.length === 0 && lineItemsTotal === 0 && (
//                         <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
//                           Nėra prekių
//                         </Typography>
//                       )}
//                     </AccordionDetails>
//                   </Accordion>
//                 )}
//                 {showRawPanels && (
//                   <Accordion sx={{ mt: 2, background: "#f6f8ff" }}>
//                     <AccordionSummary expandIcon={<ExpandMoreIcon />}>
//                       <Typography sx={{ fontWeight: 500 }}>Admin: Raw duomenys</Typography>
//                     </AccordionSummary>
//                     <AccordionDetails>
//                       <Box sx={{ mb: 2 }}>
//                         <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
//                           <Typography variant="subtitle2">OCR (glued_raw_text)</Typography>
//                           <Tooltip title="Kopijuoti">
//                             <IconButton size="small" onClick={() => copyToClipboard(gluedRawText)}>
//                               <ContentCopyIcon fontSize="small" />
//                             </IconButton>
//                           </Tooltip>
//                         </Box>
//                         <Paper variant="outlined" sx={{ p: 2, maxHeight: 280, overflow: "auto", bgcolor: "#fafafa" }}>
//                           <Box
//                             component="pre"
//                             sx={{ m: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace", fontSize: 13 }}
//                           >
//                             {gluedRawText || "—"}
//                           </Box>
//                         </Paper>
//                       </Box>

//                       <Divider sx={{ my: 2 }} />

//                       <Box>
//                         <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
//                           <Typography variant="subtitle2">Structured JSON</Typography>
//                           <Tooltip title="Kopijuoti">
//                             <IconButton size="small" onClick={() => copyToClipboard(structuredPretty)}>
//                               <ContentCopyIcon fontSize="small" />
//                             </IconButton>
//                           </Tooltip>
//                         </Box>
//                         <Paper variant="outlined" sx={{ p: 2, maxHeight: 380, overflow: "auto", bgcolor: "#0b1020" }}>
//                           <Box
//                             component="pre"
//                             sx={{
//                               m: 0,
//                               whiteSpace: "pre",
//                               color: "#c9e1ff",
//                               fontFamily:
//                                 "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
//                               fontSize: 12,
//                             }}
//                           >
//                             {structuredPretty || "—"}
//                           </Box>
//                         </Paper>
//                       </Box>

//                       {user?.is_superuser && (
//                         <>
//                           <Divider sx={{ my: 2 }} />
//                           <Box>
//                             <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
//                               <Typography variant="subtitle2" sx={{ color: "#1b4121ff", fontWeight: 500 }}>
//                                 GPT raw JSON
//                               </Typography>
//                               <Tooltip title="Kopijuoti">
//                                 <IconButton size="small" onClick={() => copyToClipboard(gptRawPretty)}>
//                                   <ContentCopyIcon fontSize="small" />
//                                 </IconButton>
//                               </Tooltip>
//                             </Box>
//                             <Paper
//                               variant="outlined"
//                               sx={{
//                                 p: 2,
//                                 maxHeight: 420,
//                                 overflow: "auto",
//                                 bgcolor: "#0b1020",
//                                 borderColor: "#cbef9aff",
//                               }}
//                             >
//                               <Box
//                                 component="pre"
//                                 sx={{
//                                   m: 0,
//                                   whiteSpace: "pre",
//                                   color: "#f5ffe6ff",
//                                   fontFamily:
//                                     "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
//                                   fontSize: 12,
//                                 }}
//                               >
//                                 {gptRawPretty || "—"}
//                               </Box>
//                             </Paper>
//                           </Box>
//                         </>
//                       )}
//                     </AccordionDetails>
//                   </Accordion>
//                 )}
//               </>
//             )}
//           </Box>
//         </DialogContent>
//       </Dialog>
//     </LocalizationProvider>
//   );
// }
