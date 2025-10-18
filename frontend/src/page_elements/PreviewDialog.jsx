import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/lt';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Divider,
  Accordion, AccordionSummary, AccordionDetails,
  Stack,
  Alert,
  Grid2,
  Paper,
  Tooltip,
  Button,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ZoomableImage from "../pages/ZoomableImage";
import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";
import DynamicAutocomplete from "./DynamicAutocomplete";
import { api } from "../api/endpoints";
import { useEffect, useRef, useState, useMemo } from "react";
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import EditableCell from "../components/EditableCell";
import EditableAutoCell from "../components/EditableAutoCell";

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

  // ==== анти-мигание: локальный превью-стейт + отмена гонок =====
  const [localPreview, setLocalPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const lastReqIdRef = useRef(0);
  const abortRef = useRef(null);

  // helper для стабильного ключа компании
  const mkKey = (id, vat, name) => {
    const idStr = id == null ? "" : String(id).trim();
    if (idStr) return `id:${idStr}`;
    const normVat  = (vat  || "").trim().toLowerCase();
    const normName = (name || "").trim().toLowerCase();
    return normVat || normName;
  };

  // оптимистичное направление на клиенте от выбранного контрагента
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

  const refreshDocument = async (id) => {
    // отменяем предыдущий запрос
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const reqId = ++lastReqIdRef.current;

    // оптимистично проставим направление сразу (без скачков)
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

      // защита от гонок
      if (reqId !== lastReqIdRef.current) return;

      setSelected(res.data);
      setDocs(prev => prev.map(d => sameId(d.id, id) ? res.data : d));

      if (isMulti) {
        if (selectedCpKey) {
          setLocalPreview(res.data.preview || null);
        } else {
          // контрагент не выбран — принудительно показываем "Pasirinkite kontrahentą"
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
      // abort — ок, молчим
    } finally {
      if (reqId === lastReqIdRef.current) setPreviewLoading(false);
    }
  };

  // Подтянуть документ при открытии/смене дока
  useEffect(() => {
    if (
      open &&
      selected?.id &&
      !String(selected.id).startsWith("temp-") &&
      prevDocId.current !== selected.id
    ) {
      setLocalPreview(null);
      refreshDocument(selected.id);
      prevDocId.current = selected.id;
    }
    if (!open) {
      prevDocId.current = null;
      setLocalPreview(null);
      setPreviewLoading(false);
    }
    // eslint-disable-next-line
  }, [open, selected?.id]);

  // В multi: при смене выбранного контрагента — сразу пересчитать превью
  useEffect(() => {
    if (open && isMulti && selected?.id) {
      refreshDocument(selected.id);
    }
    // eslint-disable-next-line
  }, [selectedCpKey]);

  const programKey = user?.default_accounting_program;
  const extraFields = programKey ? (EXTRA_FIELDS_CONFIG[programKey] || []) : [];

  const productCodeField = extraFields.find((f) => /prekes_kodas/i.test(f.name))?.name;
  const productNameField = extraFields.find((f) => /prekes_pavadinimas/i.test(f.name))?.name;

  // Валидация
  const validationFields = [
    selected?.val_subtotal_match,
    selected?.val_vat_match,
    selected?.val_total_match,
  ];
  const showValidationWarning = validationFields.some((val) => val === false);

  const lineItems = Array.isArray(selected?.line_items) ? selected.line_items : [];

  // === PREVIEW labels для multi (берём из localPreview), single — из документа
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

  // const ppLabel = isMulti
  //   ? (localPreview?.pirkimas_pardavimas_label || (hasAnyCounterparty ? "—" : "Pasirinkite kontrahentą"))
  //   : (selected?.pirkimas_pardavimas === "pirkimas"
  //       ? "Pirkimas"
  //       : selected?.pirkimas_pardavimas === "pardavimas"
  //         ? "Pardavimas"
  //         : "—");

  // const pvmLabel = isMulti
  //   ? (localPreview?.pvm_kodas_label || (hasAnyCounterparty ? (previewLoading ? "Skaičiuojama…" : "—") : "Pasirinkite kontrahentą"))
  //   : (selected?.pvm_kodas || "—");

  const previewLinePvmById = (lineId) => {
    const arr = localPreview?.line_items || [];
    const hit = arr.find(li => String(li.id) === String(lineId));
    return hit?.pvm_kodas_label || hit?.pvm_kodas || null;
  };

  // Клиент (buyer/seller)
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

  // Продукт документа (sumiskai)
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

  // Продукт конкретной строки (detaliai)
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

    setSelected(prev => ({
      ...prev,
      line_items: Array.isArray(prev?.line_items)
        ? prev.line_items.map(li =>
            sameId(li.id, lineItemId) ? { ...li, ...res.data } : li
          )
        : [],
    }));

    setDocs(prev =>
      prev.map(d =>
        sameId(d.id, selected.id)
          ? {
              ...d,
              line_items: Array.isArray(d.line_items)
                ? d.line_items.map(li =>
                    sameId(li.id, lineItemId) ? { ...li, ...res.data } : li
                  )
                : [],
            }
          : d
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

    setSelected(prev => ({
      ...prev,
      line_items: Array.isArray(prev?.line_items)
        ? prev.line_items.map(li =>
            sameId(li.id, lineItemId) ? { ...li, ...res.data } : li
          )
        : [],
    }));

    setDocs(prev =>
      prev.map(d =>
        sameId(d.id, selected.id)
          ? {
              ...d,
              line_items: Array.isArray(d.line_items)
                ? d.line_items.map(li =>
                    sameId(li.id, lineItemId) ? { ...li, ...res.data } : li
                  )
                : [],
            }
          : d
      )
    );

    if (isMulti) {
      await refreshDocument(selected.id);
    }
  };


  // ----- RAW DATA (только для админ-просмотра) -----
  const gluedRawText = useMemo(() => {
    const v = selected?.glued_raw_text;
    return typeof v === "string" ? v : (v == null ? "" : String(v));
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
  // END ----- RAW DATA (только для админ-просмотра)

  const PRODUCT_FIELDS = [
    { field: "prekes_pavadinimas", label: "Prekės pavadinimas:" },
    { field: "prekes_kodas", label: "Prekės kodas:" },
    { field: "prekes_barkodas", label: "Prekės barkodas:" },
  ];

  const accordionRef = useRef(null);
  const lastItemRef = useRef(null);

  const handleAccordionChange = (event, expanded) => {
    if (expanded && accordionRef.current) {
      setTimeout(() => {
        accordionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  };

  if (!selected) return null;

 //Editable cell

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
  const ensureCurrency = (v) => {
    if (v == null || v === "") return "";
    const up = String(v).trim().toUpperCase();
    if (!CURRENCIES.includes(up)) throw new Error("Netinkama valiuta (ISO-3)");
    return up;
  };
  const ensureTaipNe = (v) => {
    if (v == null || v === "") return null;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (s === "taip") return true;
    if (s === "ne") return false;
    throw new Error("Leidžiama: Taip / Ne");
  };

  // helper: нормализуем значение (пустые -> null, числа как числа)
  const normVal = (v) => {
    if (v === "" || v === undefined) return null;
    // если это строка числа — приводим
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
    return v;
  };

  // DOC: поддерживает saveDocFields({document_number: "INV-1"}) ИЛИ saveDocFields("document_number","INV-1")
  const saveDocFields = async (patchOrField, maybeValue) => {
    if (!selected?.id) return;

    const updates = Array.isArray(patchOrField)
      ? patchOrField // [[field,value], ...] — если захочешь батчи
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

      // обновим selected точечно (без тяжёлого GET)
      latestSelected = { ...latestSelected, [field]: res.data[field] };
    }

    setSelected(latestSelected);
    setDocs(prev => prev.map(d => (String(d.id) === String(latestSelected.id) ? latestSelected : d)));

    if (isMulti) await refreshDocument(latestSelected.id);
  };

  // LINE: saveLineFields(lineId, {price: 9.99}) ИЛИ saveLineFields(lineId, "price", 9.99)
  const saveLineFields = async (lineId, patchOrField, maybeValue) => {
    if (!selected?.id || !lineId) return;

    const updates = Array.isArray(patchOrField)
      ? patchOrField
      : (typeof patchOrField === "object" && patchOrField !== null)
        ? Object.entries(patchOrField)
        : [[patchOrField, maybeValue]];

    let changed = {};

    for (const [field, raw] of updates) {
      const value = normVal(raw);
      const res = await api.patch(
        `/scanned-documents/${selected.id}/lineitem/${lineId}/inline/`,
        { field, value },
        { withCredentials: true }
      );
      changed[field] = res.data[field];
    }

    // локально обновим только нужную строку
    setSelected(prev => ({
      ...prev,
      line_items: Array.isArray(prev?.line_items)
        ? prev.line_items.map(li =>
            String(li.id) === String(lineId) ? { ...li, ...changed } : li
          )
        : [],
    }));

    setDocs(prev => prev.map(d =>
      String(d.id) === String(selected.id)
        ? {
            ...d,
            line_items: Array.isArray(d.line_items)
              ? d.line_items.map(li =>
                  String(li.id) === String(lineId) ? { ...li, ...changed } : li
                )
              : [],
          }
        : d
    ));

    if (isMulti) await refreshDocument(selected.id);
  };



  // Dobavit / udalit lineitem

  // === ДОБАВИТЬ LINE ITEM ===

  const addLineItem = async () => {
    if (!selected?.id) return;
    const res = await api.post(`/scanned-documents/${selected.id}/add-lineitem/`, {}, { withCredentials: true });
    const newItem = res.data;

    setSelected(prev => ({
      ...prev,
      line_items: [...(prev.line_items || []), newItem],
    }));

    setDocs(prev =>
      prev.map(d =>
        String(d.id) === String(selected.id)
          ? { ...d, line_items: [...(d.line_items || []), newItem] }
          : d
      )
    );

    // плавный скролл после добавления
    setTimeout(() => {
      lastItemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  };

  // === УДАЛИТЬ LINE ITEM ===
  const deleteLineItem = async (lineId) => {
    if (!selected?.id) return;
    const confirmed = window.confirm("Ar tikrai norite ištrinti prekę?");
    if (!confirmed) return;

    await api.delete(`/scanned-documents/${selected.id}/delete-lineitem/${lineId}/`, { withCredentials: true });

    setSelected(prev => ({
      ...prev,
      line_items: (prev.line_items || []).filter(li => li.id !== lineId),
    }));

    setDocs(prev =>
      prev.map(d =>
        String(d.id) === String(selected.id)
          ? { ...d, line_items: (d.line_items || []).filter(li => li.id !== lineId) }
          : d
      )
    );
  };


  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="lt">
      <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
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
            onClick={onClose}
            sx={{
              position: 'absolute',
              right: 10,
              top: 8,
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
            overflow: "auto"
          }}
        >
          {/* Preview слева (sticky) */}
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

          {/* Правая колонка */}
          <Box width="50%" sx={{ px: 0.5 }}>
            {selected.error_message ? (
              <Typography color="error">{selected.error_message}</Typography>
            ) : (
              <>
                {showValidationWarning && (
                  <Alert severity="warning" sx={{ mb: 2, fontSize: "inherit" }}>
                    <b>Dėmesio!</b> Kai kurios sumos galimai nesutampa. Patikrinkite dokumentą!
                  </Alert>
                )}

                {/* Всегда показываем, но источник разный */}
                <Typography gutterBottom>
                  Pirkimas/pardavimas:&nbsp;
                  <b>{ppLabel}{isMulti && previewLoading ? "…" : ""}</b>
                </Typography>

                <Typography gutterBottom>
                  Dokumento tipas: <b>{selected.document_type || "—"}</b>
                </Typography>
                <Divider sx={{ my: 1 }} />

                {/* Покупатель / Продавец */}
                <Grid2 container spacing={2} sx={{ mb: 2 }}>
                  <Grid2 size={6}>
                    <Typography sx={{ mb: 1.5, fontWeight: 500, fontSize: "0.95rem" }}>Pirkėjas</Typography>
                    {["buyer_name", "buyer_id", "buyer_vat_code"].map((field) => {
                      
                      return (
                        <Box key={field} sx={{ mb: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>
                            {EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)?.label || field}
                          </Typography>
                          <EditableAutoCell
                            fieldName={field} 
                            label={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)?.label || "Pasirinkite…"}
                            value={selected[field] || ""}
                            searchUrl={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)?.search}
                            onSelect={handleClientSelect("buyer")}
                            onManualSave={async (text) => {
                              if (!selected?.id) return;
                              const res = await api.patch(
                                `/scanned-documents/${selected.id}/extra-fields/`,
                                { [field]: text || null },
                                { withCredentials: true }
                              );
                              setSelected(res.data);
                              setDocs(prev => prev.map(d => String(d.id) === String(selected.id) ? res.data : d));
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
                    <Typography sx={{ mb: 1.5, fontWeight: 500, fontSize: "0.95rem" }}>Pardavėjas</Typography>
                    {["seller_name", "seller_id", "seller_vat_code"].map((field) => {
                      const fieldNameForAuto = field.includes("_name") 
                        ? "prekes_pavadinimas" 
                        : field.includes("_id") 
                          ? "prekes_kodas" 
                          : "prekes_barkodas";
                      
                      return (
                        <Box key={field} sx={{ mb: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>
                            {EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)?.label || field}
                          </Typography>
                          <EditableAutoCell
                            fieldName={fieldNameForAuto}  // ← используем маппинг для getOptionLabel
                            label={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)?.label || "Pasirinkite…"}
                            value={selected[field] || ""}
                            searchUrl={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)?.search}
                            onSelect={handleClientSelect("seller")}
                            onManualSave={async (text) => {
                              if (!selected?.id) return;
                              const res = await api.patch(
                                `/scanned-documents/${selected.id}/extra-fields/`,
                                { [field]: text || null },
                                { withCredentials: true }
                              );
                              setSelected(res.data);
                              setDocs(prev => prev.map(d => String(d.id) === String(selected.id) ? res.data : d));
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

                {/* Даты, суммы и т.п. */}
                <Stack spacing={0.5} mt={1} mb={1}>
                  <Typography>Sąskaitos data: <EditableCell value={selected.invoice_date} inputType="date" onSave={(v) => saveDocFields("invoice_date", ensureDate(v))} /></Typography>
                  <Typography>Mokėti iki: <EditableCell value={selected.due_date} inputType="date" onSave={(v) => saveDocFields("due_date", ensureDate(v))} /></Typography>
                  <Typography>Operacijos data: <EditableCell value={selected.operation_date} inputType="date" onSave={(v) => saveDocFields("operation_date", ensureDate(v))} /></Typography>
                  <Typography>Sąskaitos serija: <EditableCell value={selected.document_series} onSave={(v) => saveDocFields("document_series", v)} /></Typography>
                  <Typography>Sąskaitos numeris: <EditableCell value={selected.document_number} onSave={(v) => saveDocFields("document_number", v)} /></Typography>
                  <Typography>Užsakymo numeris: <EditableCell value={selected.order_number} onSave={(v) => saveDocFields("order_number", v)} /></Typography>
                  <Typography>Nuolaida sąskaitai (be PVM): <EditableCell value={selected.invoice_discount_wo_vat} inputType="number" onSave={(v) => saveDocFields("invoice_discount_wo_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                  <Typography>Nuolaida sąskaitai (su PVM): <EditableCell value={selected.invoice_discount_with_vat} inputType="number" onSave={(v) => saveDocFields("invoice_discount_with_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>                  
                  <Typography>Suma (be PVM): <EditableCell value={selected.amount_wo_vat} inputType="number" onSave={(v) => saveDocFields("amount_wo_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                  <Typography>PVM: <EditableCell value={selected.vat_amount} inputType="number" onSave={(v) => saveDocFields("vat_amount", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                  <Typography>PVM %: <EditableCell value={selected.vat_percent} inputType="number" onSave={(v) => saveDocFields("vat_percent", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                  <Typography>PVM klasė: <b>{pvmLabel}{isMulti && previewLoading ? "…" : ""}</b></Typography>
                  <Typography>Suma (su PVM): <EditableCell value={selected.amount_with_vat} inputType="number" onSave={(v) => saveDocFields("amount_with_vat", ensureNumber(v))} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                  <Typography>Valiuta: <EditableCell
                    value={selected.currency}
                    inputType="select"
                    options={CURRENCIES}
                    onSave={(v)=>saveDocFields("currency", v)}
                  /></Typography>

                  <Typography>Mokėta grynais: <EditableCell
                    value={selected.paid_by_cash}
                    inputType="select"
                    options={TAIP_NE}
                    getOptionLabel={(o)=>o.label}
                    onSave={(v)=>saveDocFields("paid_by_cash", v)}
                    renderDisplay={(v)=> (v===true ? "Taip" : v===false ? "Ne" : "—")}
                  /></Typography>

                  {/* sumiskai: товар на уровне документа */}
                  {selected.scan_type === "sumiskai" && (
                    <Grid2 container spacing={2} sx={{ mb: 2 }}>
                      <Grid2 xs={12}>
                        {PRODUCT_FIELDS.map(({ field, label }) => {
                          const cfg = EXTRA_FIELDS_CONFIG.product.find(f => f.name === field); // ← ДОБАВИЛИ

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
                                label={label}                         // можно брать готовый label из PRODUCT_FIELDS
                                value={selected[field] || ""}         // конкретное поле документа
                                searchUrl={cfg?.search}               // endpoint из конфигурации
                                onSelect={handleProductSelect}        // подставит ВСЕ 3 поля (как раньше)
                                onManualSave={(text) =>               // ручная правка ТОЛЬКО текущего поля
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

                {/* Prekės (accordion) */}
                {selected.scan_type === "detaliai" && lineItems.length > 0 && (
                  <Accordion sx={{ mt: 1, background: "#fafafa" }} onChange={handleAccordionChange} ref={accordionRef}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>Prekė(s):</Typography>
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
                      {lineItems.map((item, idx) => {
                        const previewLinePvm = isMulti
                          ? (previewLinePvmById(item.id) || (previewLoading ? "Skaičiuojama…" : "—"))
                          : (item.pvm_kodas || item.vat_class || "—");
                        return (
                          <Box
                            key={item.id ?? `li-${idx}`}
                            ref={idx === lineItems.length - 1 ? lastItemRef : null} // 👈 ref к последнему
                            sx={{
                              mb: 2,
                              p: 2,
                              border: "1px solid #eee",
                              borderRadius: 2,
                              background: "#fff",
                              position: "relative",
                            }}
                          >
                            {/* delete icon */}
                            <Tooltip title="Ištrinti eilutę">
                              <IconButton
                                size="small"
                                onClick={() => deleteLineItem(item.id)}
                                sx={{
                                  position: "absolute",
                                  top: 6,
                                  right: 6,
                                  color: "text.secondary",
                                  "&:hover": { color: "error.main" },
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
                              {`Prekė #${idx + 1}`}
                            </Typography>

                            {PRODUCT_FIELDS.map(({ field, label }) => {
                              const cfg = EXTRA_FIELDS_CONFIG.product.find(f => f.name === field); // ← берём endpoint+label для конкретного поля
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
                                    value={item[field] || ""}                     // текущее значение строки
                                    searchUrl={cfg?.search}                       // endpoint автодополнения для этого поля
                                    // при выборе из списка — обновляем ВСЕ 3 поля (как и раньше)
                                    onSelect={handleLineItemProductSelect(item.id)}
                                    // ручное сохранение — только это поле
                                    onManualSave={(text) => saveLineFields(item.id, { [field]: text || null })}
                                    onClear={handleLineItemProductClear(item.id)}
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


                            {/* {PRODUCT_FIELDS.map(({ field, label }) => (
                              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} key={field}>
                                <Typography color="text.secondary" sx={{ minWidth: 130, color: "black" }}>
                                  {label}
                                </Typography>
                                <DynamicAutocomplete
                                  key={`${item.id ?? `idx-${idx}`}-${item.prekes_kodas ?? ""}-${item.prekes_pavadinimas ?? ""}-${item.prekes_barkodas ?? ""}`}
                                  field={EXTRA_FIELDS_CONFIG.product.find((f) => f.name === field)}
                                  selectedValue={{
                                    prekes_kodas: item.prekes_kodas,
                                    prekes_pavadinimas: item.prekes_pavadinimas,
                                    prekes_barkodas: item.prekes_barkodas,
                                  }}
                                  onSelect={handleLineItemProductSelect(item.id)}
                                  onClear={handleLineItemProductClear(item.id)}
                                  fullWidth
                                  size="small"
                                  sx={{
                                    mb: 1,
                                    "& .MuiInputBase-root": {
                                      minHeight: "28px",
                                      background: "transparent",
                                      fontSize: "14px",
                                      px: 1,
                                    },
                                    "& input": {
                                      padding: 0,
                                      fontSize: "14px",
                                      fontWeight: 700,
                                    },
                                  }}
                                />
                              </Stack>
                            ))} */}

                            <Stack spacing={0.5} mt={1} mb={1}>
                              {/* <Typography>Mato vnt: <b>{item.unit || "—"}</b></Typography>
                              <Typography>Kiekis: <b>{formatNumberPreview(item.quantity)}</b></Typography>
                              <Typography>Kaina: <b>{formatNumberPreview(item.price)}</b></Typography>
                              <Typography>Suma (be PVM): <b>{formatNumberPreview(item.subtotal)}</b></Typography>
                              <Typography>PVM: <b>{formatNumberPreview(item.vat)}</b></Typography>
                              <Typography>PVM %: <b>{formatNumberPreview(item.vat_percent)}</b></Typography>
                              <Typography>PVM klasė: <b>{previewLinePvm}</b></Typography>
                              <Typography>Suma (su PVM): <b>{formatNumberPreview(item.total)}</b></Typography>
                              <Typography>Nuolaida (be PVM): <b>{formatNumberPreview(item.discount_wo_vat)}</b></Typography>
                              <Typography>Nuolaida (su PVM): <b>{formatNumberPreview(item.discount_with_vat)}</b></Typography>
  */}

                              <Typography>Mato vnt: <EditableCell value={item.unit} onSave={(v) => saveLineFields(item.id, "unit", v)} /></Typography>
                              <Typography>Kiekis: <EditableCell value={item.quantity} inputType="number" onSave={(v) => saveLineFields(item.id, "quantity", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                              <Typography>Kaina: <EditableCell value={item.price} inputType="number" onSave={(v) => saveLineFields(item.id, "price", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                              <Typography>Suma (be PVM): <EditableCell value={item.subtotal} inputType="number" onSave={(v) => saveLineFields(item.id, "subtotal", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                              <Typography>PVM: <EditableCell value={item.vat} inputType="number" onSave={(v) => saveLineFields(item.id, "vat", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                              <Typography>PVM %: <EditableCell value={item.vat_percent} inputType="number" onSave={(v) => saveLineFields(item.id, "vat_percent", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                              <Typography>PVM klasė: <b>{previewLinePvm}</b></Typography>
                              <Typography>Suma (su PVM): <EditableCell value={item.total} inputType="number" onSave={(v) => saveLineFields(item.id, "total", v)} renderDisplay={(v) => <b>{formatNumberPreview(v)}</b>} /></Typography>
                              <Typography>Nuolaida (be PVM): <b>{formatNumberPreview(item.discount_wo_vat)}</b></Typography>
                              <Typography>Nuolaida (su PVM): <b>{formatNumberPreview(item.discount_with_vat)}</b></Typography>
                            </Stack>
                          </Box>
                        );
                      })}
                    </AccordionDetails>
                  </Accordion>
                )}
                {showRawPanels && (
                  <Accordion sx={{ mt: 2, background: "#f6f8ff" }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography sx={{ fontWeight: 500 }}>Admin: Raw duomenys</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {/* OCR (glued) */}
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

                      {/* Structured JSON */}
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
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                              fontSize: 12,
                            }}
                          >
                            {structuredPretty || "—"}
                          </Box>
                        </Paper>
                      </Box>
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
