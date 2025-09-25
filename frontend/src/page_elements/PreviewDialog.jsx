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
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ZoomableImage from "../pages/ZoomableImage";
import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";
import DynamicAutocomplete from "./DynamicAutocomplete";
import { api } from "../api/endpoints";
import { useEffect, useRef, useState, useMemo } from "react";
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

export default function PreviewDialog({
  open,
  onClose,
  selected,
  setSelected,
  setDocs,
  user,
  selectedCpKey,            // выбранный контрагент (multi)
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

  const PRODUCT_FIELDS = [
    { field: "prekes_pavadinimas", label: "Prekės pavadinimas:" },
    { field: "prekes_kodas", label: "Prekės kodas:" },
    { field: "prekes_barkodas", label: "Prekės barkodas:" },
  ];

  const accordionRef = useRef(null);

  const handleAccordionChange = (event, expanded) => {
    if (expanded && accordionRef.current) {
      setTimeout(() => {
        accordionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    }
  };

  if (!selected) return null;

  return (
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
                <Grid2 container spacing={3}>
                  {/* PIRKEJAS */}
                  <Grid2 xs={6}>
                    <Typography sx={{ mb: 3, fontWeight: 500 }}>Pirkėjas</Typography>
                    {["buyer_name", "buyer_id", "buyer_vat_code"].map((field) => (
                      <DynamicAutocomplete
                        key={field}
                        field={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)}
                        selectedValue={{
                          pavadinimas: selected.buyer_name,
                          imones_kodas: selected.buyer_id,
                          pvm_kodas: selected.buyer_vat_code,
                        }}
                        onSelect={handleClientSelect("buyer")}
                        onClear={handleClientClear("buyer")}
                        fullWidth
                        size="small"
                        sx={{
                          mb: 1,
                          '& .MuiInputBase-root': {
                            minHeight: '28px',
                            background: 'transparent',
                            fontSize: "inherit",
                            px: 1,
                          },
                          '& input': {
                            padding: 0,
                            fontSize: "inherit",
                          },
                        }}
                      />
                    ))}
                  </Grid2>

                  {/* PARDAVEJAS */}
                  <Grid2 xs={6}>
                    <Typography sx={{ mb: 3, fontWeight: 500 }}>Pardavėjas</Typography>
                    {["seller_name", "seller_id", "seller_vat_code"].map((field) => (
                      <DynamicAutocomplete
                        key={field}
                        field={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)}
                        selectedValue={{
                          pavadinimas: selected.seller_name,
                          imones_kodas: selected.seller_id,
                          pvm_kodas: selected.seller_vat_code,
                        }}
                        onSelect={handleClientSelect("seller")}
                        onClear={handleClientClear("seller")}
                        fullWidth
                        size="small"
                        sx={{
                          mb: 1,
                          '& .MuiInputBase-root': {
                            minHeight: '28px',
                            background: 'transparent',
                            fontSize: "inherit",
                            px: 1,
                          },
                          '& input': {
                            padding: 0,
                            fontSize: "inherit",
                          },
                        }}
                      />
                    ))}
                  </Grid2>
                </Grid2>
              </Grid2>

              <Divider sx={{ my: 1 }} />

              {/* Даты, суммы и т.п. */}
              <Stack spacing={0.5} mt={1} mb={1}>
                <Typography>Sąskaitos data: <b>{selected.invoice_date || "—"}</b></Typography>
                <Typography>Mokėti iki: <b>{selected.due_date || "—"}</b></Typography>
                <Typography>Operacijos data: <b>{selected.operation_date || "—"}</b></Typography>
                <Typography>Sąskaitos serija: <b>{selected.document_series || "—"}</b></Typography>
                <Typography>Sąskaitos numeris: <b>{selected.document_number || "—"}</b></Typography>
                <Typography>Užsakymo numeris: <b>{selected.order_number || "—"}</b></Typography>
                <Typography>Nuolaida sąskaitai (be PVM): <b>{formatNumberPreview(selected.invoice_discount_wo_vat)}</b></Typography>
                <Typography>Nuolaida sąskaitai (su PVM): <b>{formatNumberPreview(selected.invoice_discount_with_vat)}</b></Typography>
                <Typography>Suma (be PVM): <b>{formatNumberPreview(selected.amount_wo_vat)}</b></Typography>
                <Typography>PVM: <b>{formatNumberPreview(selected.vat_amount)}</b></Typography>
                <Typography>PVM %: <b>{formatNumberPreview(selected.vat_percent)}</b></Typography>

                {/* В multi показываем только превьюшный PVM klasė */}
                <Typography>PVM klasė: <b>{pvmLabel}{isMulti && previewLoading ? "…" : ""}</b></Typography>

                <Typography>Suma (su PVM): <b>{formatNumberPreview(selected.amount_with_vat)}</b></Typography>
                <Typography>Valiuta: <b>{selected.currency || "—"}</b></Typography>
                <Typography>
                  Mokėta grynais: <b>
                    {selected.paid_by_cash === true 
                      ? "Taip" 
                      : selected.paid_by_cash === false 
                        ? "Ne" 
                        : "—"}
                  </b>
                </Typography>

                {/* sumiskai: товар на уровне документа */}
                {selected.scan_type === "sumiskai" && (
                  <Grid2 container spacing={2} sx={{ mb: 2 }}>
                    <Grid2 xs={12}>
                      {PRODUCT_FIELDS.map(({ field, label }) => (
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} key={field}>
                          <Typography color="text.secondary" sx={{ minWidth: 130, color: 'black' }}>{label}</Typography>
                          <DynamicAutocomplete
                            field={EXTRA_FIELDS_CONFIG.product.find(f => f.name === field)}
                            selectedValue={{
                              prekes_pavadinimas: selected.prekes_pavadinimas || "",
                              prekes_kodas: selected.prekes_kodas || "",
                              prekes_barkodas: selected.prekes_barkodas || ""
                            }}
                            onSelect={handleProductSelect}
                            onClear={handleProductClear}
                            fullWidth
                            size="small"
                            sx={{
                              mb: 1,
                              '& .MuiInputBase-root': {
                                minHeight: '28px',
                                background: 'transparent',
                                fontSize: "inherit",
                                px: 1,
                              },
                              '& input': {
                                padding: 0,
                                fontSize: "inherit",
                              },
                            }}
                          />
                        </Stack>
                      ))}
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
                    {lineItems.map((item, idx) => {
                      const previewLinePvm = isMulti
                        ? (previewLinePvmById(item.id) || (previewLoading ? "Skaičiuojama…" : "—"))
                        : (item.pvm_kodas || item.vat_class || "—");
                      return (
                        <Box
                          key={item.id ?? `li-${idx}`}
                          sx={{ mb: 2, p: 1, border: "1px solid #eee", borderRadius: 2, background: "#fff" }}
                        >
                          <Typography sx={{ fontWeight: 100, marginBottom: 3, fontStyle: "italic" }}>
                            {`Prekė #${idx + 1}`}
                          </Typography>

                          {PRODUCT_FIELDS.map(({ field, label }) => (
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
                          ))}

                          <Stack spacing={0.5} mt={1} mb={1}>
                            <Typography>Mato vnt: <b>{item.unit || "—"}</b></Typography>
                            <Typography>Kiekis: <b>{formatNumberPreview(item.quantity)}</b></Typography>
                            <Typography>Kaina: <b>{formatNumberPreview(item.price)}</b></Typography>
                            <Typography>Suma (be PVM): <b>{formatNumberPreview(item.subtotal)}</b></Typography>
                            <Typography>PVM: <b>{formatNumberPreview(item.vat)}</b></Typography>
                            <Typography>PVM %: <b>{formatNumberPreview(item.vat_percent)}</b></Typography>
                            <Typography>PVM klasė: <b>{previewLinePvm}</b></Typography>
                            <Typography>Suma (su PVM): <b>{formatNumberPreview(item.total)}</b></Typography>
                            <Typography>Nuolaida (be PVM): <b>{formatNumberPreview(item.discount_wo_vat)}</b></Typography>
                            <Typography>Nuolaida (su PVM): <b>{formatNumberPreview(item.discount_with_vat)}</b></Typography>
                          </Stack>
                        </Box>
                      );
                    })}
                  </AccordionDetails>
                </Accordion>
              )}
            </>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
