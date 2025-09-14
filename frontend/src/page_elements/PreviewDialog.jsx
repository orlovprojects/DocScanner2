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
import { useEffect, useRef } from "react";
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

export default function PreviewDialog({
  open,
  onClose,
  selected,
  setSelected,
  setDocs,
  user,
}) {
  const prevDocId = useRef();

  useEffect(() => {
    if (
      open &&
      selected?.id &&
      !String(selected.id).startsWith("temp-") &&
      prevDocId.current !== selected.id
    ) {
      api.get(`/documents/${selected.id}/`, { withCredentials: true })
        .then(res => setSelected(res.data))
        .catch(() => {});
      prevDocId.current = selected.id;
    }
    if (!open) {
      prevDocId.current = null;
    }
    // eslint-disable-next-line
  }, [open, selected?.id]);

  const programKey = user?.default_accounting_program;
  const extraFields = programKey ? (EXTRA_FIELDS_CONFIG[programKey] || []) : [];

  const productCodeField = extraFields.find((f) =>
    /prekes_kodas/i.test(f.name)
  )?.name;
  const productNameField = extraFields.find((f) =>
    /prekes_pavadinimas/i.test(f.name)
  )?.name;

  // Валидация
  const validationFields = [
    selected?.val_subtotal_match,
    selected?.val_vat_match,
    selected?.val_total_match,
  ];
  const showValidationWarning = validationFields.some((val) => val === false);

  const lineItems = Array.isArray(selected?.line_items) ? selected.line_items : [];

  // helper сравнения id (строка/число)
  const sameId = (a, b) => String(a) === String(b);

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
              {user?.view_mode !== "multi" && (
                <Typography gutterBottom>
                  Pirkimas/pardavimas:&nbsp;
                  <b>
                    {selected.pirkimas_pardavimas === "pirkimas"
                      ? "Pirkimas"
                      : selected.pirkimas_pardavimas === "pardavimas"
                      ? "Pardavimas"
                      : "—"}
                  </b>
                </Typography>
              )}
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
                <Typography>PVM klasė: <b>{selected.pvm_kodas || "—"}</b></Typography>
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
                    {lineItems.map((item) => (
                      <Box
                        key={item.id ?? `${item.prekes_kodas}-${item.prekes_pavadinimas}`}
                        sx={{ mb: 2, p: 1, border: "1px solid #eee", borderRadius: 2, background: "#fff" }}
                      >
                        <Typography sx={{ fontWeight: 100, marginBottom: 3, fontStyle: 'italic' }}>
                          Prekė #{String(item.seq_number ?? item.id ?? "")}
                        </Typography>
                        {PRODUCT_FIELDS.map(({ field, label }) => (
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} key={field}>
                            <Typography color="text.secondary" sx={{ minWidth: 130, color: 'black' }}>{label}</Typography>
                            <DynamicAutocomplete
                              key={`${item.id}-${item.prekes_kodas ?? ""}-${item.prekes_pavadinimas ?? ""}-${item.prekes_barkodas ?? ""}`}
                              field={EXTRA_FIELDS_CONFIG.product.find(f => f.name === field)}
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
                                '& .MuiInputBase-root': {
                                  minHeight: '28px',
                                  background: 'transparent',
                                  fontSize: "14px",
                                  px: 1,
                                },
                                '& input': {
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
                          <Typography>PVM klasė: <b>{item.pvm_kodas || item.vat_class || "—"}</b></Typography>
                          <Typography>Suma (su PVM): <b>{formatNumberPreview(item.total)}</b></Typography>
                          <Typography>Nuolaida (be PVM): <b>{formatNumberPreview(item.discount_wo_vat)}</b></Typography>
                          <Typography>Nuolaida (su PVM): <b>{formatNumberPreview(item.discount_with_vat)}</b></Typography>
                        </Stack>
                      </Box>
                    ))}
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














// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   Box,
//   Typography,
//   Divider,
//   Accordion, AccordionSummary, AccordionDetails,
//   Stack,
//   Alert,
//   Grid2,
// } from "@mui/material";
// import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
// import ZoomableImage from "../pages/ZoomableImage";
// import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";
// import DynamicAutocomplete from "./DynamicAutocomplete";
// import { api } from "../api/endpoints";
// import { useEffect, useRef } from "react";
// import CloseIcon from '@mui/icons-material/Close';
// import IconButton from '@mui/material/IconButton';

// export default function PreviewDialog({
//   open,
//   onClose,
//   selected,
//   setSelected,
//   setDocs,
//   user,
// }) {
//   const prevDocId = useRef();

//   useEffect(() => {
//     if (
//       open &&
//       selected?.id &&
//       !String(selected.id).startsWith("temp-") &&
//       prevDocId.current !== selected.id
//     ) {
//       api.get(`/documents/${selected.id}/`, { withCredentials: true })
//         .then(res => setSelected(res.data))
//         .catch(() => {});
//       prevDocId.current = selected.id;
//     }
//     if (!open) {
//       prevDocId.current = null;
//     }
//     // eslint-disable-next-line
//   }, [open, selected?.id]);

//   const programKey = user?.default_accounting_program;
//   const extraFields = programKey ? (EXTRA_FIELDS_CONFIG[programKey] || []) : [];

//   const productCodeField = extraFields.find((f) =>
//     /prekes_kodas/i.test(f.name)
//   )?.name;
//   const productNameField = extraFields.find((f) =>
//     /prekes_pavadinimas/i.test(f.name)
//   )?.name;

//   // Валидация: если хотя бы одно из полей false — показать warning
//   const validationFields = [
//     // selected?.val_ar_sutapo,
//     selected?.val_subtotal_match,
//     selected?.val_vat_match,
//     selected?.val_total_match,
//   ];
//   const showValidationWarning = validationFields.some((val) => val === false);

//   const lineItems = Array.isArray(selected?.line_items) ? selected.line_items : [];

//   // Универсальный handler для выбора клиента (buyer/seller)
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
//           // apply_defaults не шлём — бэкенд разрешит по умолчанию при корректном режиме
//         }
//       : {
//           seller_name: valueObj.pavadinimas,
//           seller_id: valueObj.imones_kodas,
//           seller_vat_code: valueObj.pvm_kodas,
//           seller_iban: valueObj.ibans,
//           seller_address: valueObj.address,
//           seller_country_iso: valueObj.country_iso,
//           // apply_defaults не шлём — бэкенд разрешит по умолчанию при корректном режиме
//         };

//     const res = await api.patch(
//       `/scanned-documents/${selected.id}/extra-fields/`,
//       data,
//       { withCredentials: true }
//     );

//     setSelected(res.data);
//     setDocs(prev => prev.map(d => d.id === selected.id ? res.data : d));
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

//   // Очистка клиента: отсылаем пустые поля + apply_defaults: false, чтобы бэкенд не подставлял дефолты
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
//     setDocs(prev => prev.map(d => d.id === selected.id ? res.data : d));
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
//     setDocs(prev => prev.map(d => d.id === res.data.id ? res.data : d));
//   };

//   const handleProductClear = async () => {
//     if (!selected?.id) return;

//     const res = await api.post(
//       `/scanned-documents/${selected.id}/clear-product/`,
//       {},
//       { withCredentials: true }
//     );

//     setSelected(res.data);
//     setDocs(prev => prev.map(d => (d.id === res.data.id ? res.data : d)));
//   };

//   // Выбор товара для конкретной строки (по id)
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
//     // setSelected(prev => ({
//     //   ...prev,
//     //   line_items: prev.line_items.map(li =>
//     //     li.id === lineItemId ? { ...li, ...res.data } : li
//     //   ),
//     // }));
//     const sameId = (a, b) => String(a) === String(b);

//     setSelected(prev => ({
//       ...prev,
//       line_items: Array.isArray(prev?.line_items)
//         ? prev.line_items.map(li =>
//             sameId(li.id, lineItemId) ? { ...li, ...res.data } : li
//           )
//         : [],
//     }));

//     setDocs(prev =>
//       prev.map(d =>
//         d.id === selected.id
//           ? {
//               ...d,
//               line_items: Array.isArray(d.line_items)
//                 ? d.line_items.map(li => li.id === lineItemId ? { ...li, ...res.data } : li)
//                 : [],
//             }
//           : d
//       )
//     );
//   };

//   const PRODUCT_FIELDS = [
//     { field: "prekes_pavadinimas", label: "Prekės pavadinimas:" },
//     { field: "prekes_kodas", label: "Prekės kodas:" },
//     { field: "prekes_barkodas", label: "Prekės barkodas:" },
//   ];

//   const handleLineItemProductClear = (lineItemId) => async () => {
//     if (!selected?.id || !lineItemId) return;

//     const res = await api.post(
//       `/scanned-documents/${selected.id}/lineitem/${lineItemId}/clear-product/`,
//       {},
//       { withCredentials: true }
//     );

//     setSelected(prev => ({
//       ...prev,
//       line_items: Array.isArray(prev?.line_items)
//         ? prev.line_items.map(li => (li.id === lineItemId ? { ...li, ...res.data } : li))
//         : [],
//     }));

//     setDocs(prev =>
//       prev.map(d =>
//         d.id === selected.id
//           ? {
//               ...d,
//               line_items: Array.isArray(d.line_items)
//                 ? d.line_items.map(li => (li.id === lineItemId ? { ...li, ...res.data } : li))
//                 : [],
//             }
//           : d
//       )
//     );
//   };

//   const accordionRef = useRef(null);

//   const handleAccordionChange = (event, expanded) => {
//     if (expanded && accordionRef.current) {
//       setTimeout(() => {
//         accordionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
//       }, 200);
//     }
//   };

//   if (!selected) return null;

//   return (
//     <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
//       <DialogTitle
//         sx={{
//           fontWeight: 500,
//           fontSize: 18,
//           pr: 5,
//           pb: 1,
//           position: "relative",
//           minHeight: 44,
//         }}
//       >
//         Peržiūra
//         <IconButton
//           aria-label="close"
//           onClick={onClose}
//           sx={{
//             position: 'absolute',
//             right: 10,
//             top: 8,
//             color: (theme) => theme.palette.grey[500],
//             p: 1,
//           }}
//         >
//           <CloseIcon />
//         </IconButton>
//       </DialogTitle>
//       <DialogContent
//         dividers
//         sx={{
//           display: "flex",
//           gap: 4,
//           fontSize: 15,
//           '*': { fontSize: "inherit" },
//           minHeight: 400,
//           maxHeight: "80vh",
//           overflow: "auto"
//         }}
//       >
//         {/* Preview слева (sticky) */}
//         <Box
//           width="50%"
//           sx={{
//             position: "sticky",
//             top: 12,
//             alignSelf: "flex-start",
//             maxHeight: "75vh",
//             minHeight: 320,
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "center",
//             bgcolor: "#fff",
//             borderRadius: 2,
//             border: "1px solid #eee",
//             p: 2,
//             boxShadow: "0 2px 8px #0001",
//           }}
//         >
//           {selected.preview_url ? (
//             <ZoomableImage src={selected.preview_url} />
//           ) : (
//             <Typography color="text.secondary">Peržiūra negalima</Typography>
//           )}
//         </Box>

//         {/* Правая колонка */}
//         <Box width="50%" sx={{ px: 0.5 }}>
//           {selected.error_message ? (
//             <Typography color="error">{selected.error_message}</Typography>
//           ) : (
//             <>
//               {showValidationWarning && (
//                 <Alert severity="warning" sx={{ mb: 2, fontSize: "inherit" }}>
//                   <b>Dėmesio!</b> Kai kurios sumos galimai nesutampa. Patikrinkite dokumentą!
//                 </Alert>
//               )}
//               <Typography gutterBottom>
//                 Pirkimas/pardavimas:&nbsp;
//                 <b>
//                   {selected.pirkimas_pardavimas === "pirkimas"
//                     ? "Pirkimas"
//                     : selected.pirkimas_pardavimas === "pardavimas"
//                     ? "Pardavimas"
//                     : "—"}
//                 </b>
//               </Typography>
//               <Typography gutterBottom>
//                 Dokumento tipas: <b>{selected.document_type || "—"}</b>
//               </Typography>
//               <Divider sx={{ my: 1 }} />

//               {/* Покупатель / Продавец */}
//               <Grid2 container spacing={2} sx={{ mb: 2 }}>
//                 <Grid2 container spacing={3}>
//                   {/* PIRKEJAS */}
//                   <Grid2 xs={6}>
//                     <Typography sx={{ mb: 3, fontWeight: 500 }}>Pirkėjas</Typography>
//                     {["buyer_name", "buyer_id", "buyer_vat_code"].map((field) => (
//                       <DynamicAutocomplete
//                         key={field}
//                         field={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)}
//                         selectedValue={{
//                           pavadinimas: selected.buyer_name,
//                           imones_kodas: selected.buyer_id,
//                           pvm_kodas: selected.buyer_vat_code,
//                         }}
//                         onSelect={handleClientSelect("buyer")}
//                         onClear={handleClientClear("buyer")}
//                         fullWidth
//                         size="small"
//                         sx={{
//                           mb: 1,
//                           '& .MuiInputBase-root': {
//                             minHeight: '28px',
//                             background: 'transparent',
//                             fontSize: "inherit",
//                             px: 1,
//                           },
//                           '& input': {
//                             padding: 0,
//                             fontSize: "inherit",
//                           },
//                         }}
//                       />
//                     ))}
//                   </Grid2>

//                   {/* PARDAVEJAS */}
//                   <Grid2 xs={6}>
//                     <Typography sx={{ mb: 3, fontWeight: 500 }}>Pardavėjas</Typography>
//                     {["seller_name", "seller_id", "seller_vat_code"].map((field) => (
//                       <DynamicAutocomplete
//                         key={field}
//                         field={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)}
//                         selectedValue={{
//                           pavadinimas: selected.seller_name,
//                           imones_kodas: selected.seller_id,
//                           pvm_kodas: selected.seller_vat_code,
//                         }}
//                         onSelect={handleClientSelect("seller")}
//                         onClear={handleClientClear("seller")}
//                         fullWidth
//                         size="small"
//                         sx={{
//                           mb: 1,
//                           '& .MuiInputBase-root': {
//                             minHeight: '28px',
//                             background: 'transparent',
//                             fontSize: "inherit",
//                             px: 1,
//                           },
//                           '& input': {
//                             padding: 0,
//                             fontSize: "inherit",
//                           },
//                         }}
//                       />
//                     ))}
//                   </Grid2>
//                 </Grid2>
//               </Grid2>

//               <Divider sx={{ my: 1 }} />

//               {/* Даты, суммы и т.п. */}
//               <Stack spacing={0.5} mt={1} mb={1}>
//                 <Typography>Sąskaitos data: <b>{selected.invoice_date || "—"}</b></Typography>
//                 <Typography>Mokėti iki: <b>{selected.due_date || "—"}</b></Typography>
//                 <Typography>Operacijos data: <b>{selected.operation_date || "—"}</b></Typography>
//                 <Typography>Sąskaitos serija: <b>{selected.document_series || "—"}</b></Typography>
//                 <Typography>Sąskaitos numeris: <b>{selected.document_number || "—"}</b></Typography>
//                 <Typography>Užsakymo numeris: <b>{selected.order_number || "—"}</b></Typography>
//                 <Typography>Nuolaida sąskaitai (be PVM): <b>{formatNumberPreview(selected.invoice_discount_wo_vat)}</b></Typography>
//                 <Typography>Nuolaida sąskaitai (su PVM): <b>{formatNumberPreview(selected.invoice_discount_with_vat)}</b></Typography>
//                 <Typography>Suma (be PVM): <b>{formatNumberPreview(selected.amount_wo_vat)}</b></Typography>
//                 <Typography>PVM: <b>{formatNumberPreview(selected.vat_amount)}</b></Typography>
//                 <Typography>PVM %: <b>{formatNumberPreview(selected.vat_percent)}</b></Typography>
//                 <Typography>PVM klasė: <b>{selected.pvm_kodas || "—"}</b></Typography>
//                 <Typography>Suma (su PVM): <b>{formatNumberPreview(selected.amount_with_vat)}</b></Typography>
//                 <Typography>Valiuta: <b>{selected.currency || "—"}</b></Typography>
//                 <Typography>
//                   Mokėta grynais: <b>
//                     {selected.paid_by_cash === true 
//                       ? "Taip" 
//                       : selected.paid_by_cash === false 
//                         ? "Ne" 
//                         : "—"}
//                   </b>
//                 </Typography>

//                 {selected.scan_type === "sumiskai" && (
//                   <Grid2 container spacing={2} sx={{ mb: 2 }}>
//                     <Grid2 xs={12}>
//                       {PRODUCT_FIELDS.map(({ field, label }) => (
//                         <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} key={field}>
//                           <Typography color="text.secondary" sx={{ minWidth: 130, color: 'black' }}>{label}</Typography>
//                           {/* <DynamicAutocomplete
//                             field={EXTRA_FIELDS_CONFIG.product.find(f => f.name === field)}
//                             selectedValue={{
//                               prekes_pavadinimas: selected.prekes_pavadinimas || "",
//                               prekes_kodas: selected.prekes_kodas || "",
//                               prekes_barkodas: selected.prekes_barkodas || ""
//                             }}
//                             onSelect={handleProductSelect}
//                             onClear={handleProductClear} */}
//                           <DynamicAutocomplete
//                             key={`${item.id}-${item.prekes_kodas ?? ""}-${item.prekes_pavadinimas ?? ""}-${item.prekes_barkodas ?? ""}`}
//                             field={EXTRA_FIELDS_CONFIG.product.find(f => f.name === field)}
//                             selectedValue={{
//                               prekes_kodas: item.prekes_kodas,
//                               prekes_pavadinimas: item.prekes_pavadinimas,
//                               prekes_barkodas: item.prekes_barkodas,
//                             }}
//                             onSelect={handleLineItemProductSelect(item.id)}
//                             onClear={handleLineItemProductClear(item.id)}
//                             fullWidth
//                             size="small"
//                             sx={{
//                               mb: 1,
//                               '& .MuiInputBase-root': {
//                                 minHeight: '28px',
//                                 background: 'transparent',
//                                 fontSize: "inherit",
//                                 px: 1,
//                               },
//                               '& input': {
//                                 padding: 0,
//                                 fontSize: "inherit",
//                               },
//                             }}
//                           />
//                         </Stack>
//                       ))}
//                     </Grid2>
//                   </Grid2>
//                 )}
//               </Stack>

//               {/* Prekės (accordion) */}
//               {selected.scan_type === "detaliai" && lineItems.length > 0 && (
//                 <Accordion sx={{ mt: 1, background: "#fafafa" }} onChange={handleAccordionChange} ref={accordionRef}>
//                   <AccordionSummary expandIcon={<ExpandMoreIcon />}>
//                     <Typography>Prekė(s):</Typography>
//                   </AccordionSummary>
//                   <AccordionDetails>
//                     {lineItems.map((item, idx) => (
//                       <Box
//                         key={item.id || idx}
//                         sx={{ mb: 2, p: 1, border: "1px solid #eee", borderRadius: 2, background: "#fff" }}
//                       >
//                         <Typography sx={{ fontWeight: 100, marginBottom: 3, fontStyle: 'italic' }}>Prekė #{idx + 1}</Typography>
//                         {PRODUCT_FIELDS.map(({ field, label }) => (
//                           <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} key={field}>
//                             <Typography color="text.secondary" sx={{ minWidth: 130, color: 'black' }}>{label}</Typography>
//                             <DynamicAutocomplete
//                               field={EXTRA_FIELDS_CONFIG.product.find(f => f.name === field)}
//                               selectedValue={{
//                                 prekes_kodas: item.prekes_kodas,
//                                 prekes_pavadinimas: item.prekes_pavadinimas,
//                                 prekes_barkodas: item.prekes_barkodas,
//                               }}
//                               onSelect={handleLineItemProductSelect(item.id)}
//                               onClear={handleLineItemProductClear(item.id)}
//                               fullWidth
//                               size="small"
//                               sx={{
//                                 mb: 1,
//                                 '& .MuiInputBase-root': {
//                                   minHeight: '28px',
//                                   background: 'transparent',
//                                   fontSize: "14px",
//                                   px: 1,
//                                 },
//                                 '& input': {
//                                   padding: 0,
//                                   fontSize: "14px",
//                                   fontWeight: 700,
//                                 },
//                               }}
//                             />
//                           </Stack>
//                         ))}
//                         <Stack spacing={0.5} mt={1} mb={1}>
//                           <Typography>Mato vnt: <b>{item.unit || "—"}</b></Typography>
//                           <Typography>Kiekis: <b>{formatNumberPreview(item.quantity)}</b></Typography>
//                           <Typography>Kaina: <b>{formatNumberPreview(item.price)}</b></Typography>
//                           <Typography>Suma (be PVM): <b>{formatNumberPreview(item.subtotal)}</b></Typography>
//                           <Typography>PVM: <b>{formatNumberPreview(item.vat)}</b></Typography>
//                           <Typography>PVM %: <b>{formatNumberPreview(item.vat_percent)}</b></Typography>
//                           <Typography>PVM klasė: <b>{item.pvm_kodas || item.vat_class || "—"}</b></Typography>
//                           <Typography>Suma (su PVM): <b>{formatNumberPreview(item.total)}</b></Typography>
//                           <Typography>Nuolaida (be PVM): <b>{formatNumberPreview(item.discount_wo_vat)}</b></Typography>
//                           <Typography>Nuolaida (su PVM): <b>{formatNumberPreview(item.discount_with_vat)}</b></Typography>
//                         </Stack>
//                       </Box>
//                     ))}
//                   </AccordionDetails>
//                 </Accordion>
//               )}
//             </>
//           )}
//         </Box>
//       </DialogContent>
//     </Dialog>
//   );
// }






// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   Box,
//   Typography,
//   Divider,
//   Accordion, AccordionSummary, AccordionDetails,
//   Stack,
//   Alert,
//   Grid2,
// } from "@mui/material";
// import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
// import ZoomableImage from "../pages/ZoomableImage";
// import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";
// import DynamicAutocomplete from "./DynamicAutocomplete";
// import { api } from "../api/endpoints";
// import { useEffect, useRef } from "react";
// import CloseIcon from '@mui/icons-material/Close';
// import IconButton from '@mui/material/IconButton';

// export default function PreviewDialog({
//   open,
//   onClose,
//   selected,
//   setSelected,
//   setDocs,
//   user,
// }) {
//   const prevDocId = useRef();

//   useEffect(() => {
//     if (
//       open &&
//       selected?.id &&
//       !String(selected.id).startsWith("temp-") &&
//       prevDocId.current !== selected.id
//     ) {
//       api.get(`/documents/${selected.id}/`, { withCredentials: true })
//         .then(res => setSelected(res.data))
//         .catch(() => {});
//       prevDocId.current = selected.id;
//     }
//     if (!open) {
//       prevDocId.current = null;
//     }
//     // eslint-disable-next-line
//   }, [open, selected?.id]);

//   const programKey = user?.default_accounting_program;
//   const extraFields = programKey ? (EXTRA_FIELDS_CONFIG[programKey] || []) : [];

//   const productCodeField = extraFields.find((f) =>
//     /prekes_kodas/i.test(f.name)
//   )?.name;
//   const productNameField = extraFields.find((f) =>
//     /prekes_pavadinimas/i.test(f.name)
//   )?.name;

//   // Валидация: если хотя бы одно из полей false — показать warning
//   const validationFields = [
//     // selected?.val_ar_sutapo,
//     selected?.val_subtotal_match,
//     selected?.val_vat_match,
//     selected?.val_total_match,
//   ];
//   const showValidationWarning = validationFields.some((val) => val === false);

//   const lineItems = Array.isArray(selected?.line_items) ? selected.line_items : [];

//   // Универсальный handler для выбора клиента (buyer/seller)
//   const handleClientSelect = (type) => async (valueObj) => {
//     if (!valueObj || !selected || !selected.id) return;
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

//     // Получаем полностью обновлённый документ (backend уже пересчитал все нужные поля)
//     const res = await api.patch(
//       `/scanned-documents/${selected.id}/extra-fields/`,
//       data,
//       { withCredentials: true }
//     );

//     setSelected(res.data); // Полностью заменяем selected на новый объект
//     setDocs(prev =>
//       prev.map(d => d.id === selected.id ? res.data : d) // Тоже полностью заменяем объект!
//     );
//   };

//   function formatNumberPreview(value) {
//     if (value === null || value === undefined || value === "") return "—";
//     let num = Number(value);
//     if (isNaN(num)) return value;

//     // Получаем дробную часть
//     let [int, dec = ""] = num.toFixed(4).split(".");
//     if (dec.length < 4) dec = dec.padEnd(4, "0");

//     // Если 3-й и 4-й нули — выводим 2 знака
//     if (dec[2] === "0" && dec[3] === "0") {
//       return `${int}.${dec.slice(0, 2)}`;
//     }
//     // Иначе показываем все 4 знака (даже если заканчиваются на нули)
//     return `${int}.${dec}`;
//   }

//   const handleClientClear = (type) => async () => {
//     const data = type === "buyer"
//       ? { buyer_name: "", buyer_id: "", buyer_vat_code: "" }
//       : { seller_name: "", seller_id: "", seller_vat_code: "" };

//     const res = await api.patch(
//       `/scanned-documents/${selected.id}/extra-fields/`,
//       data,
//       { withCredentials: true }
//     );
//     setSelected(res.data);
//     setDocs(prev => prev.map(d => d.id === selected.id ? res.data : d));
//   };

//   const handleProductSelect = async (valueObj) => {
//     if (!valueObj) return;
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
//     setDocs(prev => prev.map(d => d.id === res.data.id ? res.data : d));
//   };

//   const handleProductClear = async () => {
//     if (!selected?.id) return;

//     const res = await api.post(
//       `/scanned-documents/${selected.id}/clear-product/`,
//       {},
//       { withCredentials: true }
//     );

//     setSelected(res.data); // сервер вернул весь документ
//     setDocs(prev => prev.map(d => (d.id === res.data.id ? res.data : d)));
//   };

//   // Выбор товара для конкретной строки (по id)
//   const handleLineItemProductSelect = (lineItemId) => async (valueObj) => {
//     if (!valueObj) return;
//     const data = {
//       prekes_kodas: valueObj.prekes_kodas || valueObj.code || "",
//       prekes_pavadinimas: valueObj.prekes_pavadinimas || valueObj.name || "",
//       prekes_barkodas: valueObj.prekes_barkodas || valueObj.barkodas || valueObj.barcode || "",
//     };
//     // PATCH для одной строки
//     const res = await api.patch(
//       `/scanned-documents/${selected.id}/lineitem/${lineItemId}/`,
//       data,
//       { withCredentials: true }
//     );
//     // В ответе желательно вернуть весь обновлённый line item
//     setSelected(prev => ({
//       ...prev,
//       line_items: prev.line_items.map(li =>
//         li.id === lineItemId ? { ...li, ...res.data } : li
//       ),
//     }));
//     setDocs(prev =>
//       prev.map(d =>
//         d.id === selected.id
//           ? {
//               ...d,
//               line_items: Array.isArray(d.line_items)
//                 ? d.line_items.map(li => li.id === lineItemId ? { ...li, ...res.data } : li)
//                 : [],
//             }
//           : d
//       )
//     );
//   };

//   const PRODUCT_FIELDS = [
//     { field: "prekes_pavadinimas", label: "Prekės pavadinimas:" },
//     { field: "prekes_kodas", label: "Prekės kodas:" },
//     { field: "prekes_barkodas", label: "Prekės barkodas:" },
//   ];

//   const handleLineItemProductClear = (lineItemId) => async () => {
//     if (!selected?.id || !lineItemId) return;

//     const res = await api.post(
//       `/scanned-documents/${selected.id}/lineitem/${lineItemId}/clear-product/`,
//       {},
//       { withCredentials: true }
//     );

//     // сервер вернул обновлённый line item
//     setSelected(prev => ({
//       ...prev,
//       line_items: Array.isArray(prev?.line_items)
//         ? prev.line_items.map(li => (li.id === lineItemId ? { ...li, ...res.data } : li))
//         : [],
//     }));

//     setDocs(prev =>
//       prev.map(d =>
//         d.id === selected.id
//           ? {
//               ...d,
//               line_items: Array.isArray(d.line_items)
//                 ? d.line_items.map(li => (li.id === lineItemId ? { ...li, ...res.data } : li))
//                 : [],
//             }
//           : d
//       )
//     );
//   };

//   const accordionRef = useRef(null);

//   const handleAccordionChange = (event, expanded) => {
//     if (expanded && accordionRef.current) {
//       setTimeout(() => {
//         accordionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
//       }, 200);
//     }
//   };

//   // Только после хуков — проверки!
//   if (!selected) return null;


//   return (
//     <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
//       <DialogTitle
//         sx={{
//           fontWeight: 500,
//           fontSize: 18,
//           pr: 5,
//           pb: 1,
//           position: "relative",
//           minHeight: 44,
//         }}
//       >
//         Peržiūra
//         <IconButton
//           aria-label="close"
//           onClick={onClose}
//           sx={{
//             position: 'absolute',
//             right: 10,
//             top: 8,
//             color: (theme) => theme.palette.grey[500],
//             p: 1,
//           }}
//         >
//           <CloseIcon />
//         </IconButton>
//       </DialogTitle>
//       <DialogContent
//         dividers
//         sx={{
//           display: "flex",
//           gap: 4,
//           fontSize: 15,
//           '*': { fontSize: "inherit" },
//           minHeight: 400,
//           maxHeight: "80vh",
//           overflow: "auto"
//         }}
//       >
//         {/* Preview слева (sticky) */}
//         <Box
//           width="50%"
//           sx={{
//             position: "sticky",
//             top: 12,
//             alignSelf: "flex-start",
//             maxHeight: "75vh",
//             minHeight: 320,
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "center",
//             bgcolor: "#fff",
//             borderRadius: 2,
//             border: "1px solid #eee",
//             p: 2,
//             boxShadow: "0 2px 8px #0001",
//           }}
//         >
//           {selected.preview_url ? (
//             <ZoomableImage src={selected.preview_url} />
//           ) : (
//             <Typography color="text.secondary">Peržiūra negalima</Typography>
//           )}
//         </Box>
//         {/* Правая колонка (информация и формы) */}
//         <Box width="50%" sx={{ px: 0.5 }}>
//           {selected.error_message ? (
//             <Typography color="error">{selected.error_message}</Typography>
//           ) : (
//             <>
//               {showValidationWarning && (
//                 <Alert severity="warning" sx={{ mb: 2, fontSize: "inherit" }}>
//                   <b>Dėmesio!</b> Kai kurios sumos galimai nesutampa. Patikrinkite dokumentą!
//                 </Alert>
//               )}
//               <Typography gutterBottom>
//                 Pirkimas/pardavimas:&nbsp;
//                 <b>
//                   {selected.pirkimas_pardavimas === "pirkimas"
//                     ? "Pirkimas"
//                     : selected.pirkimas_pardavimas === "pardavimas"
//                     ? "Pardavimas"
//                     : "—"}
//                 </b>
//               </Typography>
//               <Typography gutterBottom>
//                 Dokumento tipas: <b>{selected.document_type || "—"}</b>
//               </Typography>
//               <Divider sx={{ my: 1 }} />

//               {/* Покупатель / Продавец */}
//               <Grid2 container spacing={2} sx={{ mb: 2 }}>
//                 <Grid2 container spacing={3}>
//                   {/* PIRKEJAS */}
//                   <Grid2 xs={6}>
//                     <Typography sx={{ mb: 3, fontWeight: 500 }}>Pirkėjas</Typography>
//                     {["buyer_name", "buyer_id", "buyer_vat_code"].map((field) => (
//                       <DynamicAutocomplete
//                         key={field}
//                         field={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)}
//                         selectedValue={{
//                           pavadinimas: selected.buyer_name,
//                           imones_kodas: selected.buyer_id,
//                           pvm_kodas: selected.buyer_vat_code,
//                         }}
//                         onSelect={handleClientSelect("buyer")}
//                         onClear={handleClientClear("buyer")}
//                         fullWidth
//                         size="small"
//                         sx={{
//                           mb: 1,
//                           '& .MuiInputBase-root': {
//                             minHeight: '28px',
//                             background: 'transparent',
//                             fontSize: "inherit",
//                             px: 1,
//                           },
//                           '& input': {
//                             padding: 0,
//                             fontSize: "inherit",
//                           },
//                         }}
//                       />
                      
//                     ))}
//                   </Grid2>
//                   {/* PARDAVEJAS */}
//                   <Grid2 xs={6}>
//                     <Typography sx={{ mb: 3, fontWeight: 500 }}>Pardavėjas</Typography>
//                     {["seller_name", "seller_id", "seller_vat_code"].map((field) => (
//                       <DynamicAutocomplete
//                         key={field}
//                         field={EXTRA_FIELDS_CONFIG.client.find(f => f.name === field)}
//                         selectedValue={{
//                           pavadinimas: selected.seller_name,
//                           imones_kodas: selected.seller_id,
//                           pvm_kodas: selected.seller_vat_code,
//                         }}
//                         onSelect={handleClientSelect("seller")}
//                         onClear={handleClientClear("seller")}
//                         fullWidth
//                         size="small"
//                         sx={{
//                           mb: 1,
//                           '& .MuiInputBase-root': {
//                             minHeight: '28px',
//                             background: 'transparent',
//                             fontSize: "inherit",
//                             px: 1,
//                           },
//                           '& input': {
//                             padding: 0,
//                             fontSize: "inherit",
//                           },
//                         }}
//                       />
//                     ))}
//                   </Grid2>
//                 </Grid2>
//               </Grid2>
//               <Divider sx={{ my: 1 }} />

//               {/* Даты, суммы и т.п. */}
//               <Stack spacing={0.5} mt={1} mb={1}>
//                 <Typography>Sąskaitos data: <b>{selected.invoice_date || "—"}</b></Typography>
//                 <Typography>Mokėti iki: <b>{selected.due_date || "—"}</b></Typography>
//                 <Typography>Operacijos data: <b>{selected.operation_date || "—"}</b></Typography>
//                 <Typography>Sąskaitos serija: <b>{selected.document_series || "—"}</b></Typography>
//                 <Typography>Sąskaitos numeris: <b>{selected.document_number || "—"}</b></Typography>
//                 <Typography>Užsakymo numeris: <b>{selected.order_number || "—"}</b></Typography>
//                 <Typography>Nuolaida sąskaitai (be PVM): <b>{formatNumberPreview(selected.invoice_discount_wo_vat)}</b></Typography>
//                 <Typography>Nuolaida sąskaitai (su PVM): <b>{formatNumberPreview(selected.invoice_discount_with_vat)}</b></Typography>
//                 <Typography>Suma (be PVM): <b>{formatNumberPreview(selected.amount_wo_vat)}</b></Typography>
//                 <Typography>PVM: <b>{formatNumberPreview(selected.vat_amount)}</b></Typography>
//                 <Typography>PVM %: <b>{formatNumberPreview(selected.vat_percent)}</b></Typography>
//                 <Typography>PVM klasė: <b>{selected.pvm_kodas || "—"}</b></Typography>
//                 <Typography>Suma (su PVM): <b>{formatNumberPreview(selected.amount_with_vat)}</b></Typography>
//                 <Typography>Valiuta: <b>{selected.currency || "—"}</b></Typography>
//                 <Typography>
//                   Mokėta grynais: <b>
//                     {selected.paid_by_cash === true 
//                       ? "Taip" 
//                       : selected.paid_by_cash === false 
//                         ? "Ne" 
//                         : "—"}
//                   </b>
//                 </Typography>
//                 {selected.scan_type === "sumiskai" && (
//                   <Grid2 container spacing={2} sx={{ mb: 2 }}>
//                     <Grid2 xs={12}>
//                       {PRODUCT_FIELDS.map(({ field, label }) => (
//                         <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} key={field}>
//                           <Typography color="text.secondary" sx={{ minWidth: 130, color: 'black' }}>{label}</Typography>
//                           <DynamicAutocomplete
//                             field={EXTRA_FIELDS_CONFIG.product.find(f => f.name === field)}
//                             selectedValue={{
//                               prekes_pavadinimas: selected.prekes_pavadinimas || "",
//                               prekes_kodas: selected.prekes_kodas || "",
//                               prekes_barkodas: selected.prekes_barkodas || ""
//                             }}
//                             onSelect={handleProductSelect}
//                             onClear={handleProductClear}
//                             fullWidth
//                             size="small"
//                             sx={{
//                               mb: 1,
//                               '& .MuiInputBase-root': {
//                                 minHeight: '28px',
//                                 background: 'transparent',
//                                 fontSize: "inherit",
//                                 px: 1,
//                               },
//                               '& input': {
//                                 padding: 0,
//                                 fontSize: "inherit",
//                               },
//                             }}
//                           />
//                         </Stack>
//                       ))}
//                     </Grid2>
//                   </Grid2>
//                 )}
//               </Stack>

//               {/* Prekės (accordion) */}
//               {selected.scan_type === "detaliai" && lineItems.length > 0 && (
//                 <Accordion sx={{ mt: 1, background: "#fafafa" }} onChange={handleAccordionChange} ref={accordionRef}>
//                   <AccordionSummary expandIcon={<ExpandMoreIcon />}>
//                     <Typography>Prekė(s):</Typography>
//                   </AccordionSummary>
//                   <AccordionDetails>
//                     {lineItems.map((item, idx) => (
//                       <Box
//                         key={item.id || idx}
//                         sx={{ mb: 2, p: 1, border: "1px solid #eee", borderRadius: 2, background: "#fff" }}
//                       >
//                         <Typography sx={{ fontWeight: 100, marginBottom: 3, fontStyle: 'italic' }}>Prekė #{idx + 1}</Typography>
//                         {PRODUCT_FIELDS.map(({ field, label }) => (
//                           <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} key={field}>
//                             <Typography color="text.secondary" sx={{ minWidth: 130, color: 'black' }}>{label}</Typography>
//                             <DynamicAutocomplete
//                               field={EXTRA_FIELDS_CONFIG.product.find(f => f.name === field)}
//                               selectedValue={{
//                                 prekes_kodas: item.prekes_kodas,
//                                 prekes_pavadinimas: item.prekes_pavadinimas,
//                                 prekes_barkodas: item.prekes_barkodas,
//                               }}
//                               onSelect={handleLineItemProductSelect(item.id)}
//                               onClear={handleLineItemProductClear(item.id)}
//                               fullWidth
//                               size="small"
//                               sx={{
//                                 mb: 1,
//                                 '& .MuiInputBase-root': {
//                                   minHeight: '28px',
//                                   background: 'transparent',
//                                   fontSize: "14px",
//                                   px: 1,
//                                 },
//                                 '& input': {
//                                   padding: 0,
//                                   fontSize: "14px",
//                                   fontWeight: 700,
//                                 },
//                               }}
//                             />
//                           </Stack>
//                         ))}
//                         <Stack spacing={0.5} mt={1} mb={1}>
//                           {/* <Typography>Prekės kodas: <b>{item.prekes_kodas || item.product_code || "—"}</b></Typography>
//                           <Typography>Prekės barkodas: <b>{item.prekes_barkodas || "—"}</b></Typography>
//                           <Typography>Prekės pavadinimas: <b>{item.prekes_pavadinimas || item.product_name || "—"}</b></Typography> */}
//                           <Typography>Mato vnt: <b>{item.unit || "—"}</b></Typography>
//                           <Typography>Kiekis: <b>{formatNumberPreview(item.quantity)}</b></Typography>
//                           <Typography>Kaina: <b>{formatNumberPreview(item.price)}</b></Typography>
//                           <Typography>Suma (be PVM): <b>{formatNumberPreview(item.subtotal)}</b></Typography>
//                           <Typography>PVM: <b>{formatNumberPreview(item.vat)}</b></Typography>
//                           <Typography>PVM %: <b>{formatNumberPreview(item.vat_percent)}</b></Typography>
//                           <Typography>PVM klasė: <b>{item.pvm_kodas || item.vat_class || "—"}</b></Typography>
//                           <Typography>Suma (su PVM): <b>{formatNumberPreview(item.total)}</b></Typography>
//                           <Typography>Nuolaida (be PVM): <b>{formatNumberPreview(item.discount_wo_vat)}</b></Typography>
//                           <Typography>Nuolaida (su PVM): <b>{formatNumberPreview(item.discount_with_vat)}</b></Typography>
//                         </Stack>
//                       </Box>
//                     ))}
//                   </AccordionDetails>
//                 </Accordion>
//               )}
//             </>
//           )}
//         </Box>
//       </DialogContent>
//     </Dialog>
//   );

// }



// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   DialogActions,
//   Box,
//   Typography,
//   Divider,
//   Button,
//   Accordion, AccordionSummary, AccordionDetails,
//   Stack,
//   Grid2,
//   Alert,
// } from "@mui/material";
// import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
// import ZoomableImage from "../pages/ZoomableImage";
// import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";
// import DynamicAutocomplete from "./DynamicAutocomplete";
// import { api } from "../api/endpoints";
// import { useCallback, useEffect, useRef } from "react";

// export default function PreviewDialog({
//   open,
//   onClose,
//   selected,
//   setSelected,
//   setDocs,
//   user,
// }) {
//   // Хуки — только здесь!
//   const prevDocId = useRef();

//   useEffect(() => {
//     if (
//       open &&
//       selected?.id &&
//       !String(selected.id).startsWith("temp-") &&
//       prevDocId.current !== selected.id
//     ) {
//       api.get(`/documents/${selected.id}/`, { withCredentials: true })
//         .then(res => setSelected(res.data))
//         .catch(() => {});
//       prevDocId.current = selected.id;
//     }
//     if (!open) {
//       prevDocId.current = null;
//     }
//     // eslint-disable-next-line
//   }, [open, selected?.id]);

//   const programKey = user?.default_accounting_program;
//   const extraFields = programKey ? (EXTRA_FIELDS_CONFIG[programKey] || []) : [];

//   const productCodeField = extraFields.find((f) =>
//     /prekes_kodas/i.test(f.name)
//   )?.name;
//   const productNameField = extraFields.find((f) =>
//     /prekes_pavadinimas/i.test(f.name)
//   )?.name;

//   const validationFields = [
//     selected?.val_ar_sutapo,
//     selected?.val_subtotal_match,
//     selected?.val_vat_match,
//     selected?.val_total_match,
// ];
// const showValidationWarning = validationFields.some((val) => val === false);

//   const handleExtraFieldChange = async (fieldName, valueObj) => {
//     let valueToSave = valueObj;
//     if (typeof valueObj === "object" && valueObj !== null) {
//       valueToSave = valueObj.code || valueObj.name || valueObj.id;
//     }
//     await api.patch(
//       `/scanned-documents/${selected.id}/extra-fields/`,
//       { [fieldName]: valueToSave },
//       { withCredentials: true }
//     );
//     setSelected((prev) => ({ ...prev, [fieldName]: valueToSave }));
//     setDocs((prev) =>
//       prev.map((d) => (d.id === selected.id ? { ...d, [fieldName]: valueToSave } : d))
//     );
//   };

//   const handleProductPairChange = useCallback(
//     async ({ mainField, mainValue, relatedField, relatedValue, valueObj }) => {
//       await api.patch(
//         `/scanned-documents/${selected.id}/extra-fields/`,
//         { [mainField]: mainValue, [relatedField]: relatedValue },
//         { withCredentials: true }
//       );
//       setSelected((prev) => ({
//         ...prev,
//         [mainField]: mainValue,
//         [relatedField]: relatedValue,
//       }));
//       setDocs((prev) =>
//         prev.map((d) =>
//           d.id === selected.id
//             ? { ...d, [mainField]: mainValue, [relatedField]: relatedValue }
//             : d
//         )
//       );
//     },
//     [selected, setSelected, setDocs]
//   );

//   const handleProductPairClear = useCallback(async () => {
//     await api.patch(
//       `/scanned-documents/${selected.id}/extra-fields/`,
//       { [productCodeField]: "", [productNameField]: "" },
//       { withCredentials: true }
//     );
//     setSelected((prev) => ({
//       ...prev,
//       [productCodeField]: "",
//       [productNameField]: "",
//     }));
//     setDocs((prev) =>
//       prev.map((d) =>
//         d.id === selected.id
//           ? { ...d, [productCodeField]: "", [productNameField]: "" }
//           : d
//       )
//     );
//   }, [selected, setSelected, setDocs, productCodeField, productNameField]);

//   // Только после хуков — проверки!
//   if (!selected) return null;

//   return (
//     <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
//       <DialogTitle>Peržiūra</DialogTitle>
//       <DialogActions>
//         <Button onClick={onClose}>Uždaryti</Button>
//       </DialogActions>
//       <DialogContent dividers sx={{ display: "flex", gap: 4 }}>
//         <Box width="50%">
//           {selected.preview_url ? (
//             <ZoomableImage src={selected.preview_url} />
//           ) : (
//             <Typography color="text.secondary">Peržiūra negalima</Typography>
//           )}
//         </Box>
//         <Box width="50%">
//           {selected.error_message ? (
//             <Typography color="error">{selected.error_message}</Typography>
//           ) : (
//             <>
//               {/* --- Верхние данные --- */}
//               <>
//                 {showValidationWarning && (
//                   <Alert severity="warning" sx={{ mb: 2 }}>
//                     <b>Dėmesio!</b> Kai kurios sumos arba suderinimo rezultatai nesutampa su dokumento duomenimis. Patikrinkite faktūras!
//                   </Alert>
//                 )}

//                 {/* Остальной код превьюшки */}
//               </>
//               <Typography variant="subtitle1" gutterBottom>
//                 Pirkimas/pardavimas: <b>{selected.pirkimas_pardavimas === "pirkimas" ? "Pirkimas" : selected.pirkimas_pardavimas === "pardavimas" ? "Pardavimas" : "—"}</b>
//               </Typography>
//               <Typography variant="subtitle1" gutterBottom>
//                 Dokumento tipas: <b>{selected.document_type || "—"}</b>
//               </Typography>
//               <Divider sx={{ my: 1 }} />

//               {/* --- Grid2: buyer/seller --- */}
//               <Grid2 container spacing={2} sx={{ mb: 2 }}>
//                 <Grid2 xs={6}>
//                   <Typography variant="subtitle2">Pirkejas:</Typography>
//                   <div>{selected.buyer_name || "—"}</div>
//                   <Typography variant="subtitle2">Pirkejo įmonės kodas:</Typography>
//                   <div>{selected.buyer_id || "—"}</div>
//                   <Typography variant="subtitle2">Pirkejo PVM kodas:</Typography>
//                   <div>{selected.buyer_vat_code || "—"}</div>
//                 </Grid2>
//                 <Grid2 xs={6}>
//                   <Typography variant="subtitle2">Pardavejas:</Typography>
//                   <div>{selected.seller_name || "—"}</div>
//                   <Typography variant="subtitle2">Pardavėjo įmonės kodas:</Typography>
//                   <div>{selected.seller_id || "—"}</div>
//                   <Typography variant="subtitle2">Pardavėjo PVM kodas:</Typography>
//                   <div>{selected.seller_vat_code || "—"}</div>
//                 </Grid2>
//               </Grid2>
//               <Divider sx={{ my: 1 }} />

//               {/* --- Stack: даты, суммы и т.п. --- */}
//               <Stack spacing={0.5} mt={1} mb={1}>
//                 <Typography>Sąskaitos data: <b>{selected.invoice_date || "—"}</b></Typography>
//                 <Typography>Mokėti iki: <b>{selected.due_date || "—"}</b></Typography>
//                 <Typography>Operacijos data: <b>{selected.operation_date || "—"}</b></Typography>
//                 <Typography>Sąskaitos serija: <b>{selected.document_series || "—"}</b></Typography>
//                 <Typography>Sąskaitos numeris: <b>{selected.document_number || "—"}</b></Typography>
//                 <Typography>Užsakymo numeris: <b>{selected.order_number || "—"}</b></Typography>
//                 <Typography>Suma (be PVM): <b>{selected.amount_wo_vat || "—"}</b></Typography>
//                 <Typography>PVM: <b>{selected.vat_amount || "—"}</b></Typography>
//                 <Typography>PVM %: <b>{selected.vat_percent || "—"}</b></Typography>
//                 <Typography>PVM klasė: <b>{selected.pvm_kodas || "—"}</b></Typography>
//                 <Typography>Suma (su PVM): <b>{selected.amount_with_vat || "—"}</b></Typography>
//                 <Typography>Valiuta: <b>{selected.currency || "—"}</b></Typography>
//               </Stack>

//               {/* --- Prekės (accordion) --- */}
//               {(selected.scan_type === "detaliai" && selected.line_items && selected.line_items.length > 0) && (
//                 <Accordion sx={{ mt: 1 }}>
//                   <AccordionSummary expandIcon={<ExpandMoreIcon />}>
//                     <Typography>Prekė(s):</Typography>
//                   </AccordionSummary>
//                   <AccordionDetails>
//                     {selected.line_items.map((item, idx) => (
//                       <Box key={item.id || idx} sx={{ mb: 2, p: 1, border: "1px solid #eee", borderRadius: 2 }}>
//                         <Typography variant="subtitle2">#{idx + 1}</Typography>
//                         <div>Prekės kodas: <b>{item.prekes_kodas || item.product_code || "—"}</b></div>
//                         <div>Prekės barkodas: <b>{item.prekes_barkodas || "—"}</b></div>
//                         <div>Prekės pavadinimas: <b>{item.prekes_pavadinimas || item.product_name || "—"}</b></div>
//                         <div>Mato vnt: <b>{item.unit || "—"}</b></div>
//                         <div>Kiekis: <b>{item.quantity || "—"}</b></div>
//                         <div>Kaina: <b>{item.price || "—"}</b></div>
//                         <div>Suma (be PVM): <b>{item.subtotal || "—"}</b></div>
//                         <div>PVM: <b>{item.vat || "—"}</b></div>
//                         <div>PVM %: <b>{item.vat_percent || "—"}</b></div>
//                         <div>PVM klasė: <b>{item.pvm_kodas || item.vat_class || "—"}</b></div>
//                         <div>Suma (su PVM): <b>{item.total || "—"}</b></div>
//                       </Box>
//                     ))}
//                   </AccordionDetails>
//                 </Accordion>
//               )}
//             </>
//           )}
//         </Box>
//       </DialogContent>
//     </Dialog>
//   );
// }













// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   DialogActions,
//   Box,
//   Typography,
//   Table,
//   TableBody,
//   TableRow,
//   TableCell,
//   Divider,
//   CircularProgress,
//   Button,
//   TextField,
// } from "@mui/material";
// import ZoomableImage from "../pages/ZoomableImage";
// import { api } from "../api/endpoints";
// import { EXTRA_FIELDS_CONFIG } from "../pages/extraFieldsConfig";

// export default function PreviewDialog({
//   open,
//   onClose,
//   selected,
//   setSelected,
//   setDocs,
//   user,
// }) {
//   if (!selected) return null;

//   const extraFields = EXTRA_FIELDS_CONFIG[user?.default_accounting_program] || [];

//   const handleExtraFieldChange = async (field, value) => {
//     await api.patch(`/api/${selected.id}/extra-fields/`, { [field]: value }, { withCredentials: true });
//     setSelected((prev) => ({ ...prev, [field]: value }));
//     setDocs((prev) => prev.map((d) => d.id === selected.id ? { ...d, [field]: value } : d));
//   };

//   return (
//     <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
//       <DialogTitle>Peržiūra</DialogTitle>
//       <DialogContent dividers sx={{ display: "flex", gap: 4 }}>
//         <Box width="50%">
//           {selected.preview_url ? (
//             <ZoomableImage src={selected.preview_url} />
//           ) : (
//             <Typography color="text.secondary">Peržiūra negalima</Typography>
//           )}
//         </Box>
//         <Box width="50%">
//           {selected.error_message ? (
//             <Typography color="error">{selected.error_message}</Typography>
//           ) : (
//             <>
//               {/* Extra fields */}
//               {extraFields.length > 0 && (
//                 <>
//                   <Divider sx={{ my: 2 }} />
//                   <Typography variant="h6" gutterBottom>
//                     Papildomi laukai
//                   </Typography>
//                   {extraFields.map((field) => (
//                     <TextField
//                       key={field.name}
//                       label={field.label}
//                       value={selected[field.name] || ""}
//                       onChange={(e) => handleExtraFieldChange(field.name, e.target.value)}
//                       sx={{ mb: 2, width: "100%" }}
//                       size="small"
//                     />
//                   ))}
//                 </>
//               )}
//               <Typography variant="h6" gutterBottom>
//                 Struktūrizuoti duomenys
//               </Typography>
//               <Table size="small">
//                 <TableBody>
//                   {Object.entries(selected.structured_json || {}).map(([k, v]) => (
//                     <TableRow key={k}>
//                       <TableCell sx={{ fontWeight: 500 }}>{k}</TableCell>
//                       <TableCell>
//                         {typeof v === "object" && v !== null
//                           ? JSON.stringify(v)
//                           : v ?? "—"}
//                       </TableCell>
//                     </TableRow>
//                   ))}
//                 </TableBody>
//               </Table>
//             </>
//           )}
//         </Box>
//       </DialogContent>
//       <DialogActions>
//         <Button onClick={onClose}>Uždaryti</Button>
//       </DialogActions>
//     </Dialog>
//   );
// }
