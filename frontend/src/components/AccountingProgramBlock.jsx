import React, { useEffect, useState } from "react";
import {
  Box, Typography, FormControl, InputLabel, Select, MenuItem, Alert,
} from "@mui/material";
import { api } from "../api/endpoints";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";

/**
 * Самодостаточный блок «Buhalterinė programa».
 * Загружает данные из /profile/, рендерит только Select программы.
 * API keys → APIProviderKeys, Extra fields → InvoiceExtraFields.
 */
export default function AccountingProgramBlock({ onProgramChange }) {
  const [program, setProgram] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get("/profile/", { withCredentials: true }).then(({ data }) => {
      const prog = data.default_accounting_program || "";
      setProgram(prog);
      if (onProgramChange) onProgramChange(prog);
    });
  }, []);

  const handleProgramChange = async (e) => {
    const v = e.target.value;
    setProgram(v);
    if (onProgramChange) onProgramChange(v);
    setSaving(true);
    try {
      await api.patch("/profile/", { default_accounting_program: v }, { withCredentials: true });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Pasirinkite savo buhalterinę programą sąskaitų duomenų eksportui.
      </Typography>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="inv-acc-prog-label">Buhalterinė programa</InputLabel>
        <Select
          labelId="inv-acc-prog-label"
          value={program}
          label="Buhalterinė programa"
          onChange={handleProgramChange}
          disabled={saving}
          sx={{ backgroundColor: '#fff' }}
          MenuProps={{ disableScrollLock: true }}
        >
          {ACCOUNTING_PROGRAMS.map((p) => (
            <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {success && <Alert severity="success" sx={{ mb: 2 }}>Išsaugota!</Alert>}
    </Box>
  );
}


// import React, { useEffect, useState } from "react";
// import {
//   Box, Typography, FormControl, InputLabel, Select, MenuItem,
//   Button, Alert, TextField, Stack, Grid2, Chip, Tooltip,
//   IconButton, Switch, FormControlLabel,
// } from "@mui/material";
// import { alpha } from "@mui/material/styles";
// import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
// import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
// import { api } from "../api/endpoints";
// import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
// import { AccountingProgramExtraSettings } from "../page_elements/AccountingProgramExtraSettings";

// /**
//  * Самодостаточный блок «Buhalterinė programa ir papildomi laukai».
//  * Загружает данные из /profile/, рендерит Select + AccountingProgramExtraSettings,
//  * сохраняет изменения обратно в /profile/ (и /settings/dineta|optimum если нужно).
//  *
//  * Можно встраивать на любую страницу без пробрасывания десятков props.
//  */
// export default function AccountingProgramBlock({ hideExtraFields = false }) {
//   const [program, setProgram] = useState("");
//   const [saving, setSaving] = useState(false);
//   const [success, setSuccess] = useState(false);
//   const [extraSettings, setExtraSettings] = useState({});

//   // ── Dineta API ──
//   const [dinetaSettings, setDinetaSettings] = useState({ url: "", username: "", password: "" });
//   const [dinetaLoading, setDinetaLoading] = useState(false);
//   const [dinetaSaving, setDinetaSaving] = useState(false);
//   const [dinetaSuccess, setDinetaSuccess] = useState(false);
//   const [dinetaError, setDinetaError] = useState("");

//   // ── Optimum API ──
//   const [optimumSettings, setOptimumSettings] = useState({ key: "" });
//   const [optimumSaving, setOptimumSaving] = useState(false);
//   const [optimumSuccess, setOptimumSuccess] = useState(false);
//   const [optimumError, setOptimumError] = useState("");
//   const [optimumMeta, setOptimumMeta] = useState({
//     has_key: false, key_suffix: "", verified_at: null,
//     last_ok: null, last_error_at: null, last_error: "",
//   });
//   const [optimumTesting, setOptimumTesting] = useState(false);
//   const [optimumDeleting, setOptimumDeleting] = useState(false);
//   const [showOptimumKeyInput, setShowOptimumKeyInput] = useState(false);

//   // ── Rivile ERP ──
//   const [rivileErpFields, setRivileErpFields] = useState({
//     pirkimas_zurnalo_kodas: "", pirkimas_padalinio_kodas: "", pirkimas_objekto_kodas: "",
//     pardavimas_zurnalo_kodas: "", pardavimas_padalinio_kodas: "", pardavimas_objekto_kodas: "",
//   });
//   const [savingRivileErp, setSavingRivileErp] = useState(false);
//   const [successRivileErp, setSuccessRivileErp] = useState(false);
//   const [errorRivileErp, setErrorRivileErp] = useState("");

//   // ── Rivile Gama ──
//   const [rivileGamaFields, setRivileGamaFields] = useState({
//     pirkimas_padalinys: "", pirkimas_objektas: "", pirkimas_serija: "",
//     pirkimas_centras: "", pirkimas_atskaitingas_asmuo: "", pirkimas_logistika: "",
//     pirkimas_pinigu_saskaitos_kodas: "", pirkimas_saskaitos_rysio_kodas: "",
//     pirkimas_prekes_grupe: "", pirkimas_paslaugos_grupe: "", pirkimas_kodo_grupe: "",
//     pardavimas_padalinys: "", pardavimas_objektas: "", pardavimas_serija: "",
//     pardavimas_centras: "", pardavimas_atskaitingas_asmuo: "", pardavimas_logistika: "",
//     pardavimas_pinigu_saskaitos_kodas: "", pardavimas_saskaitos_rysio_kodas: "",
//     pardavimas_prekes_grupe: "", pardavimas_paslaugos_grupe: "", pardavimas_kodo_grupe: "",
//   });
//   const [savingRivileGama, setSavingRivileGama] = useState(false);
//   const [successRivileGama, setSuccessRivileGama] = useState(false);
//   const [errorRivileGama, setErrorRivileGama] = useState("");

//   // ── Assembly (Rivile Gama) ──
//   const [prekesAssemblyPirkimas, setPrekesAssemblyPirkimas] = useState(1);
//   const [prekesAssemblyPardavimas, setPrekesAssemblyPardavimas] = useState(1);
//   const [paslaugosAssemblyPirkimas, setPaslaugosAssemblyPirkimas] = useState(1);
//   const [paslaugosAssemblyPardavimas, setPaslaugosAssemblyPardavimas] = useState(1);
//   const [savingPrekesAssembly] = useState(false);
//   const [successPrekesAssembly] = useState(false);

//   // ── Butent ──
//   const [butentFields, setButentFields] = useState({
//     pirkimas_sandelis: "", pirkimas_operacija: "",
//     pardavimas_sandelis: "", pardavimas_operacija: "",
//   });
//   const [savingButent, setSavingButent] = useState(false);
//   const [successButent, setSuccessButent] = useState(false);
//   const [errorButent, setErrorButent] = useState("");

//   // ── Finvalda ──
//   const [finvaldaFields, setFinvaldaFields] = useState({
//     pirkimas_sandelis: "", pirkimas_tipas: "", pirkimas_zurnalas: "",
//     pirkimas_padalinys: "", pirkimas_darbuotojas: "",
//     pardavimas_sandelis: "", pardavimas_tipas: "", pardavimas_zurnalas: "",
//     pardavimas_padalinys: "", pardavimas_darbuotojas: "",
//   });
//   const [savingFinvalda, setSavingFinvalda] = useState(false);
//   const [successFinvalda, setSuccessFinvalda] = useState(false);
//   const [errorFinvalda, setErrorFinvalda] = useState("");

//   // ── Centas ──
//   const [centasFields, setCentasFields] = useState({
//     pirkimas_sandelis: "", pirkimas_kastu_centras: "",
//     pardavimas_sandelis: "", pardavimas_kastu_centras: "",
//   });
//   const [savingCentas, setSavingCentas] = useState(false);
//   const [successCentas, setSuccessCentas] = useState(false);
//   const [errorCentas, setErrorCentas] = useState("");

//   // ── Pragma4 ──
//   const [pragma4Fields, setPragma4Fields] = useState({
//     pirk_sandelio_kodas: "", pirk_projekto_kodas: "", pirk_centro_kodas: "", pirk_dk_schemos_kodas: "",
//     pard_sandelio_kodas: "", pard_projekto_kodas: "", pard_centro_kodas: "", pard_dk_schemos_kodas: "",
//   });
//   const [savingPragma4, setSavingPragma4] = useState(false);
//   const [successPragma4, setSuccessPragma4] = useState(false);
//   const [errorPragma4, setErrorPragma4] = useState("");

//   // ── Dineta extra ──
//   const [dinetaFields, setDinetaFields] = useState({
//     pirk_sandelio_kodas: "", pard_sandelio_kodas: "",
//   });
//   const [savingDineta, setSavingDineta] = useState(false);
//   const [successDineta, setSuccessDineta] = useState(false);
//   const [errorDineta, setErrorDineta] = useState("");

//   // ── Optimum extra ──
//   const [optimumFields, setOptimumFields] = useState({
//     pirk_prekes_tipas: "", pirk_prekes_grupe: "", pirk_sandelio_kodas: "",
//     pirk_skyriaus_kodas: "", pirk_projekto_kodas: "", pirk_atsakingo_darb_kodas: "",
//     tiekejo_grupe: "",
//     pard_prekes_tipas: "", pard_prekes_grupe: "", pard_sandelio_kodas: "",
//     pard_skyriaus_kodas: "", pard_projekto_kodas: "", pard_atsakingo_darb_kodas: "",
//     pirkejo_grupe: "",
//   });
//   const [savingOptimum, setSavingOptimum] = useState(false);
//   const [successOptimum, setSuccessOptimum] = useState(false);
//   const [errorOptimum, setErrorOptimum] = useState("");

//   // ── Debetas ──
//   const [debetasFields, setDebetasFields] = useState({
//     pirkimas_filialas: "", pirkimas_padalinys: "", pirkimas_objektas: "",
//     pirkimas_materialiai_atsakingas_asmuo: "", pirkimas_atskaitingas_asmuo: "",
//     pardavimas_filialas: "", pardavimas_padalinys: "", pardavimas_objektas: "",
//     pardavimas_materialiai_atsakingas_asmuo: "", pardavimas_atskaitingas_asmuo: "",
//   });
//   const [savingDebetas, setSavingDebetas] = useState(false);
//   const [successDebetas, setSuccessDebetas] = useState(false);
//   const [errorDebetas, setErrorDebetas] = useState("");

//   // ── Pragma3 ──
//   const [pragma3Fields, setPragma3Fields] = useState({
//     pirkimas_sandelis: "", pirkimas_korespondencija: "", pirkimas_projektas: "",
//     pardavimas_sandelis: "", pardavimas_korespondencija: "", pardavimas_projektas: "",
//   });
//   const [savingPragma3, setSavingPragma3] = useState(false);
//   const [successPragma3, setSuccessPragma3] = useState(false);
//   const [errorPragma3, setErrorPragma3] = useState("");

//   // ── Site.pro ──
//   const [siteProFields, setSiteProFields] = useState({
//     pirkimas_prekes_grupe: "", pirkimas_sandelis: "", pirkimas_darbuotojas: "", pirkimas_kastu_centras: "",
//     pardavimas_prekes_grupe: "", pardavimas_sandelis: "", pardavimas_darbuotojas: "", pardavimas_kastu_centras: "",
//   });
//   const [savingSitePro, setSavingSitePro] = useState(false);
//   const [successSitePro, setSuccessSitePro] = useState(false);
//   const [errorSitePro, setErrorSitePro] = useState("");

//   // ── Agnum ──
//   const [agnumFields, setAgnumFields] = useState({
//     pirkimas_sandelis: "", pirkimas_grupe: "", pirkimas_objektas: "",
//     pardavimas_sandelis: "", pardavimas_grupe: "", pardavimas_objektas: "",
//   });
//   const [savingAgnum, setSavingAgnum] = useState(false);
//   const [successAgnum, setSuccessAgnum] = useState(false);
//   const [errorAgnum, setErrorAgnum] = useState("");

//   // ═════════════════════════════════════════════════════
//   // Helper: извлечь сообщение об ошибке
//   // ═════════════════════════════════════════════════════
//   const extractMsg = (e, fallback) => {
//     const data = e?.response?.data;
//     let msg = data?.detail || data?.non_field_errors || data?.error || fallback;
//     if (Array.isArray(msg)) msg = msg.join(", ");
//     if (typeof msg === "object") {
//       try { msg = JSON.stringify(msg); } catch { msg = fallback; }
//     }
//     return String(msg || fallback);
//   };

//   // ═════════════════════════════════════════════════════
//   // Load profile
//   // ═════════════════════════════════════════════════════
//   useEffect(() => {
//     api.get("/profile/", { withCredentials: true }).then(({ data }) => {
//       setProgram(data.default_accounting_program || "");
//       setExtraSettings(data.extra_settings || {});

//       // Rivile ERP
//       const ref = data.rivile_erp_extra_fields || {};
//       setRivileErpFields({
//         pirkimas_zurnalo_kodas: ref.pirkimas_zurnalo_kodas || "",
//         pirkimas_padalinio_kodas: ref.pirkimas_padalinio_kodas || "",
//         pirkimas_objekto_kodas: ref.pirkimas_objekto_kodas || "",
//         pardavimas_zurnalo_kodas: ref.pardavimas_zurnalo_kodas || "",
//         pardavimas_padalinio_kodas: ref.pardavimas_padalinio_kodas || "",
//         pardavimas_objekto_kodas: ref.pardavimas_objekto_kodas || "",
//       });

//       // Rivile Gama
//       const gama = data.rivile_gama_extra_fields || {};
//       setRivileGamaFields({
//         pirkimas_padalinys: gama.pirkimas_padalinys || "",
//         pirkimas_objektas: gama.pirkimas_objektas || "",
//         pirkimas_serija: gama.pirkimas_serija || "",
//         pirkimas_centras: gama.pirkimas_centras || "",
//         pirkimas_atskaitingas_asmuo: gama.pirkimas_atskaitingas_asmuo || "",
//         pirkimas_logistika: gama.pirkimas_logistika || "",
//         pirkimas_pinigu_saskaitos_kodas: gama.pirkimas_pinigu_saskaitos_kodas || "",
//         pirkimas_saskaitos_rysio_kodas: gama.pirkimas_saskaitos_rysio_kodas || "",
//         pirkimas_prekes_grupe: gama.pirkimas_prekes_grupe || "",
//         pirkimas_paslaugos_grupe: gama.pirkimas_paslaugos_grupe || "",
//         pirkimas_kodo_grupe: gama.pirkimas_kodo_grupe || "",
//         pardavimas_padalinys: gama.pardavimas_padalinys || "",
//         pardavimas_objektas: gama.pardavimas_objektas || "",
//         pardavimas_serija: gama.pardavimas_serija || "",
//         pardavimas_centras: gama.pardavimas_centras || "",
//         pardavimas_atskaitingas_asmuo: gama.pardavimas_atskaitingas_asmuo || "",
//         pardavimas_logistika: gama.pardavimas_logistika || "",
//         pardavimas_pinigu_saskaitos_kodas: gama.pardavimas_pinigu_saskaitos_kodas || "",
//         pardavimas_saskaitos_rysio_kodas: gama.pardavimas_saskaitos_rysio_kodas || "",
//         pardavimas_prekes_grupe: gama.pardavimas_prekes_grupe || "",
//         pardavimas_paslaugos_grupe: gama.pardavimas_paslaugos_grupe || "",
//         pardavimas_kodo_grupe: gama.pardavimas_kodo_grupe || "",
//       });
//       setPrekesAssemblyPirkimas(gama.prekes_assembly_pirkimas != null ? Number(gama.prekes_assembly_pirkimas) : 1);
//       setPrekesAssemblyPardavimas(gama.prekes_assembly_pardavimas != null ? Number(gama.prekes_assembly_pardavimas) : 1);
//       setPaslaugosAssemblyPirkimas(gama.paslaugos_assembly_pirkimas != null ? Number(gama.paslaugos_assembly_pirkimas) : 1);
//       setPaslaugosAssemblyPardavimas(gama.paslaugos_assembly_pardavimas != null ? Number(gama.paslaugos_assembly_pardavimas) : 1);

//       // Butent
//       const butent = data.butent_extra_fields || {};
//       setButentFields({
//         pirkimas_sandelis: butent.pirkimas_sandelis || "", pirkimas_operacija: butent.pirkimas_operacija || "",
//         pardavimas_sandelis: butent.pardavimas_sandelis || "", pardavimas_operacija: butent.pardavimas_operacija || "",
//       });

//       // Finvalda
//       const fin = data.finvalda_extra_fields || {};
//       setFinvaldaFields({
//         pirkimas_sandelis: fin.pirkimas_sandelis || "", pirkimas_tipas: fin.pirkimas_tipas || "",
//         pirkimas_zurnalas: fin.pirkimas_zurnalas || "", pirkimas_padalinys: fin.pirkimas_padalinys || "",
//         pirkimas_darbuotojas: fin.pirkimas_darbuotojas || "",
//         pardavimas_sandelis: fin.pardavimas_sandelis || "", pardavimas_tipas: fin.pardavimas_tipas || "",
//         pardavimas_zurnalas: fin.pardavimas_zurnalas || "", pardavimas_padalinys: fin.pardavimas_padalinys || "",
//         pardavimas_darbuotojas: fin.pardavimas_darbuotojas || "",
//       });

//       // Centas
//       const cent = data.centas_extra_fields || {};
//       setCentasFields({
//         pirkimas_sandelis: cent.pirkimas_sandelis || "", pirkimas_kastu_centras: cent.pirkimas_kastu_centras || "",
//         pardavimas_sandelis: cent.pardavimas_sandelis || "", pardavimas_kastu_centras: cent.pardavimas_kastu_centras || "",
//       });

//       // Pragma4
//       const pragma4 = data.pragma4_extra_fields || {};
//       setPragma4Fields({
//         pirk_sandelio_kodas: pragma4.pirk_sandelio_kodas || "", pirk_projekto_kodas: pragma4.pirk_projekto_kodas || "",
//         pirk_centro_kodas: pragma4.pirk_centro_kodas || "", pirk_dk_schemos_kodas: pragma4.pirk_dk_schemos_kodas || "",
//         pard_sandelio_kodas: pragma4.pard_sandelio_kodas || "", pard_projekto_kodas: pragma4.pard_projekto_kodas || "",
//         pard_centro_kodas: pragma4.pard_centro_kodas || "", pard_dk_schemos_kodas: pragma4.pard_dk_schemos_kodas || "",
//       });

//       // Dineta extra
//       const dineta = data.dineta_extra_fields || {};
//       setDinetaFields({
//         pirk_sandelio_kodas: dineta.pirk_sandelio_kodas || "",
//         pard_sandelio_kodas: dineta.pard_sandelio_kodas || "",
//       });

//       // Optimum extra
//       const optimum = data.optimum_extra_fields || {};
//       setOptimumFields({
//         pirk_prekes_tipas: optimum.pirk_prekes_tipas || "", pirk_prekes_grupe: optimum.pirk_prekes_grupe || "",
//         pirk_sandelio_kodas: optimum.pirk_sandelio_kodas || "", pirk_skyriaus_kodas: optimum.pirk_skyriaus_kodas || "",
//         pirk_projekto_kodas: optimum.pirk_projekto_kodas || "", pirk_atsakingo_darb_kodas: optimum.pirk_atsakingo_darb_kodas || "",
//         tiekejo_grupe: optimum.tiekejo_grupe || "",
//         pard_prekes_tipas: optimum.pard_prekes_tipas || "", pard_prekes_grupe: optimum.pard_prekes_grupe || "",
//         pard_sandelio_kodas: optimum.pard_sandelio_kodas || "", pard_skyriaus_kodas: optimum.pard_skyriaus_kodas || "",
//         pard_projekto_kodas: optimum.pard_projekto_kodas || "", pard_atsakingo_darb_kodas: optimum.pard_atsakingo_darb_kodas || "",
//         pirkejo_grupe: optimum.pirkejo_grupe || "",
//       });

//       // Debetas
//       const debetas = data.debetas_extra_fields || {};
//       setDebetasFields({
//         pirkimas_filialas: debetas.pirkimas_filialas || "", pirkimas_padalinys: debetas.pirkimas_padalinys || "",
//         pirkimas_objektas: debetas.pirkimas_objektas || "",
//         pirkimas_materialiai_atsakingas_asmuo: debetas.pirkimas_materialiai_atsakingas_asmuo || "",
//         pirkimas_atskaitingas_asmuo: debetas.pirkimas_atskaitingas_asmuo || "",
//         pardavimas_filialas: debetas.pardavimas_filialas || "", pardavimas_padalinys: debetas.pardavimas_padalinys || "",
//         pardavimas_objektas: debetas.pardavimas_objektas || "",
//         pardavimas_materialiai_atsakingas_asmuo: debetas.pardavimas_materialiai_atsakingas_asmuo || "",
//         pardavimas_atskaitingas_asmuo: debetas.pardavimas_atskaitingas_asmuo || "",
//       });

//       // Pragma3
//       const pragma3 = data.pragma3_extra_fields || {};
//       setPragma3Fields({
//         pirkimas_sandelis: pragma3.pirkimas_sandelis || "", pirkimas_korespondencija: pragma3.pirkimas_korespondencija || "",
//         pirkimas_projektas: pragma3.pirkimas_projektas || "",
//         pardavimas_sandelis: pragma3.pardavimas_sandelis || "", pardavimas_korespondencija: pragma3.pardavimas_korespondencija || "",
//         pardavimas_projektas: pragma3.pardavimas_projektas || "",
//       });

//       // Site.pro
//       const sitePro = data.site_pro_extra_fields || {};
//       setSiteProFields({
//         pirkimas_prekes_grupe: sitePro.pirkimas_prekes_grupe || "", pirkimas_sandelis: sitePro.pirkimas_sandelis || "",
//         pirkimas_darbuotojas: sitePro.pirkimas_darbuotojas || "", pirkimas_kastu_centras: sitePro.pirkimas_kastu_centras || "",
//         pardavimas_prekes_grupe: sitePro.pardavimas_prekes_grupe || "", pardavimas_sandelis: sitePro.pardavimas_sandelis || "",
//         pardavimas_darbuotojas: sitePro.pardavimas_darbuotojas || "", pardavimas_kastu_centras: sitePro.pardavimas_kastu_centras || "",
//       });

//       // Agnum
//       const agn = data.agnum_extra_fields || {};
//       setAgnumFields({
//         pirkimas_sandelis: agn.pirkimas_sandelis || "", pirkimas_grupe: agn.pirkimas_grupe || "",
//         pirkimas_objektas: agn.pirkimas_objektas || "",
//         pardavimas_sandelis: agn.pardavimas_sandelis || "", pardavimas_grupe: agn.pardavimas_grupe || "",
//         pardavimas_objektas: agn.pardavimas_objektas || "",
//       });
//     });
//   }, []);

//   // ── Load Dineta API settings ──
//   useEffect(() => {
//     if (program !== "dineta") return;
//     setDinetaLoading(true);
//     setDinetaError("");
//     api.get("/settings/dineta/", { withCredentials: true })
//       .then(({ data }) => {
//         setDinetaSettings({
//           url: data?.url || "", username: data?.username || "", password: data?.password || "",
//         });
//       })
//       .catch(() => {})
//       .finally(() => setDinetaLoading(false));
//   }, [program]);

//   // ── Load Optimum meta ──
//   useEffect(() => {
//     if (program !== "optimum") return;
//     refreshOptimumMeta();
//   }, [program]);

//   const refreshOptimumMeta = async () => {
//     try {
//       const { data } = await api.get("/settings/optimum/", { withCredentials: true });
//       setOptimumMeta({
//         has_key: !!data?.has_key, key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null, last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null, last_error: data?.last_error ?? "",
//       });
//     } catch {}
//   };

//   // ═════════════════════════════════════════════════════
//   // Save handlers
//   // ═════════════════════════════════════════════════════
//   const handleProgramChange = async (e) => {
//     const v = e.target.value;
//     setProgram(v);
//     setSaving(true);
//     try {
//       await api.patch("/profile/", { default_accounting_program: v }, { withCredentials: true });
//       setSuccess(true);
//       setTimeout(() => setSuccess(false), 2000);
//     } catch {}
//     finally { setSaving(false); }
//   };

//   const makeExtraSaver = (fieldName, setFields, setSaving, setSuccess, setError, fallback) =>
//     async () => {
//       setSaving(true); setError("");
//       try {
//         const payload = {};
//         // Для Rivile Gama: объединяем с assembly
//         if (fieldName === "rivile_gama_extra_fields") {
//           payload[fieldName] = {
//             ...rivileGamaFields,
//             prekes_assembly_pirkimas: prekesAssemblyPirkimas,
//             prekes_assembly_pardavimas: prekesAssemblyPardavimas,
//             paslaugos_assembly_pirkimas: paslaugosAssemblyPirkimas,
//             paslaugos_assembly_pardavimas: paslaugosAssemblyPardavimas,
//           };
//         } else {
//           // Для остальных — берём текущее значение стейта напрямую
//           // (передаётся через замыкание в вызывающем коде)
//         }
//         // Этот вариант не сработает универсально,
//         // поэтому реализуем каждый сейвер отдельно ниже.
//       } catch (e) {
//         setError(extractMsg(e, fallback));
//       } finally { setSaving(false); }
//     };

//   // Индивидуальные сейверы (каждый знает свои поля)
//   const saveRivileErpFields = async () => {
//     setSavingRivileErp(true); setErrorRivileErp("");
//     try {
//       await api.patch("/profile/", { rivile_erp_extra_fields: rivileErpFields }, { withCredentials: true });
//       setSuccessRivileErp(true); setTimeout(() => setSuccessRivileErp(false), 2000);
//     } catch (e) { setErrorRivileErp(extractMsg(e, "Nepavyko išsaugoti Rivilė ERP nustatymų.")); }
//     finally { setSavingRivileErp(false); }
//   };

//   const saveRivileGamaFields = async () => {
//     setSavingRivileGama(true); setErrorRivileGama("");
//     try {
//       await api.patch("/profile/", {
//         rivile_gama_extra_fields: {
//           ...rivileGamaFields,
//           prekes_assembly_pirkimas: prekesAssemblyPirkimas,
//           prekes_assembly_pardavimas: prekesAssemblyPardavimas,
//           paslaugos_assembly_pirkimas: paslaugosAssemblyPirkimas,
//           paslaugos_assembly_pardavimas: paslaugosAssemblyPardavimas,
//         },
//       }, { withCredentials: true });
//       setSuccessRivileGama(true); setTimeout(() => setSuccessRivileGama(false), 2000);
//     } catch (e) { setErrorRivileGama(extractMsg(e, "Nepavyko išsaugoti Rivilė Gama nustatymų.")); }
//     finally { setSavingRivileGama(false); }
//   };

//   const saveButentFields = async () => {
//     setSavingButent(true); setErrorButent("");
//     try {
//       await api.patch("/profile/", { butent_extra_fields: butentFields }, { withCredentials: true });
//       setSuccessButent(true); setTimeout(() => setSuccessButent(false), 2000);
//     } catch (e) { setErrorButent(extractMsg(e, "Nepavyko išsaugoti Butent nustatymų.")); }
//     finally { setSavingButent(false); }
//   };

//   const saveFinvaldaFields = async () => {
//     setSavingFinvalda(true); setErrorFinvalda("");
//     try {
//       await api.patch("/profile/", { finvalda_extra_fields: finvaldaFields }, { withCredentials: true });
//       setSuccessFinvalda(true); setTimeout(() => setSuccessFinvalda(false), 2000);
//     } catch (e) { setErrorFinvalda(extractMsg(e, "Nepavyko išsaugoti Finvalda nustatymų.")); }
//     finally { setSavingFinvalda(false); }
//   };

//   const saveCentasFields = async () => {
//     setSavingCentas(true); setErrorCentas("");
//     try {
//       await api.patch("/profile/", { centas_extra_fields: centasFields }, { withCredentials: true });
//       setSuccessCentas(true); setTimeout(() => setSuccessCentas(false), 2000);
//     } catch (e) { setErrorCentas(extractMsg(e, "Nepavyko išsaugoti Centas nustatymų.")); }
//     finally { setSavingCentas(false); }
//   };

//   const savePragma4Fields = async () => {
//     setSavingPragma4(true); setErrorPragma4("");
//     try {
//       await api.patch("/profile/", { pragma4_extra_fields: pragma4Fields }, { withCredentials: true });
//       setSuccessPragma4(true); setTimeout(() => setSuccessPragma4(false), 2000);
//     } catch (e) { setErrorPragma4(extractMsg(e, "Nepavyko išsaugoti Pragma4 nustatymų.")); }
//     finally { setSavingPragma4(false); }
//   };

//   const saveDinetaFields = async () => {
//     setSavingDineta(true); setErrorDineta("");
//     try {
//       await api.patch("/profile/", { dineta_extra_fields: dinetaFields }, { withCredentials: true });
//       setSuccessDineta(true); setTimeout(() => setSuccessDineta(false), 2000);
//     } catch (e) { setErrorDineta(extractMsg(e, "Nepavyko išsaugoti Dineta nustatymų.")); }
//     finally { setSavingDineta(false); }
//   };

//   const saveOptimumFields = async () => {
//     setSavingOptimum(true); setErrorOptimum("");
//     try {
//       await api.patch("/profile/", { optimum_extra_fields: optimumFields }, { withCredentials: true });
//       setSuccessOptimum(true); setTimeout(() => setSuccessOptimum(false), 2000);
//     } catch (e) { setErrorOptimum(extractMsg(e, "Nepavyko išsaugoti Optimum nustatymų.")); }
//     finally { setSavingOptimum(false); }
//   };

//   const saveDebetasFields = async () => {
//     setSavingDebetas(true); setErrorDebetas("");
//     try {
//       await api.patch("/profile/", { debetas_extra_fields: debetasFields }, { withCredentials: true });
//       setSuccessDebetas(true); setTimeout(() => setSuccessDebetas(false), 2000);
//     } catch (e) { setErrorDebetas(extractMsg(e, "Nepavyko išsaugoti Debetas nustatymų.")); }
//     finally { setSavingDebetas(false); }
//   };

//   const savePragma3Fields = async () => {
//     setSavingPragma3(true); setErrorPragma3("");
//     try {
//       await api.patch("/profile/", { pragma3_extra_fields: pragma3Fields }, { withCredentials: true });
//       setSuccessPragma3(true); setTimeout(() => setSuccessPragma3(false), 2000);
//     } catch (e) { setErrorPragma3(extractMsg(e, "Nepavyko išsaugoti Pragma 3 nustatymų.")); }
//     finally { setSavingPragma3(false); }
//   };

//   const saveSiteProFields = async () => {
//     setSavingSitePro(true); setErrorSitePro("");
//     try {
//       await api.patch("/profile/", { site_pro_extra_fields: siteProFields }, { withCredentials: true });
//       setSuccessSitePro(true); setTimeout(() => setSuccessSitePro(false), 2000);
//     } catch (e) { setErrorSitePro(extractMsg(e, "Nepavyko išsaugoti Site.pro nustatymų.")); }
//     finally { setSavingSitePro(false); }
//   };

//   const saveAgnumFields = async () => {
//     setSavingAgnum(true); setErrorAgnum("");
//     try {
//       await api.patch("/profile/", { agnum_extra_fields: agnumFields }, { withCredentials: true });
//       setSuccessAgnum(true); setTimeout(() => setSuccessAgnum(false), 2000);
//     } catch (e) { setErrorAgnum(extractMsg(e, "Nepavyko išsaugoti Agnum nustatymų.")); }
//     finally { setSavingAgnum(false); }
//   };

//   // ── Dineta API save ──
//   const saveDinetaSettings = async () => {
//     setDinetaSaving(true); setDinetaError(""); setDinetaSuccess(false);
//     const { url, username, password } = dinetaSettings;
//     if (!url.trim() || !username.trim() || !password) {
//       setDinetaError("Visi API laukai yra privalomi.");
//       setDinetaSaving(false); return;
//     }
//     try {
//       const { data } = await api.put("/settings/dineta/", { url, username, password }, { withCredentials: true });
//       setDinetaSettings(prev => ({
//         ...prev, url: data?.url || prev.url, username: data?.username || prev.username,
//         password: data?.password || "••••••••",
//       }));
//       if (data?.connection_status === "warning") {
//         setDinetaError(data.connection_message || "Prisijungimo patikrinimas nepavyko.");
//       }
//       setDinetaSuccess(true); setTimeout(() => setDinetaSuccess(false), 3000);
//     } catch (e) { setDinetaError(extractMsg(e, "Nepavyko išsaugoti Dineta nustatymų.")); }
//     finally { setDinetaSaving(false); }
//   };

//   // ── Optimum API save / test / delete ──
//   const saveOptimumSettings = async () => {
//     setOptimumSaving(true); setOptimumError(""); setOptimumSuccess(false);
//     const key = (optimumSettings.key || "").trim();
//     if (!key) { setOptimumError("API Key yra privalomas."); setOptimumSaving(false); return; }
//     try {
//       const { data } = await api.put("/settings/optimum/", { key }, { withCredentials: true });
//       setOptimumSettings({ key: "" });
//       setOptimumMeta({
//         has_key: !!data?.has_key, key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null, last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null, last_error: data?.last_error ?? "",
//       });
//       setShowOptimumKeyInput(false);
//       setOptimumSuccess(true); setTimeout(() => setOptimumSuccess(false), 2500);
//     } catch (e) {
//       setOptimumError(extractMsg(e, "Nepavyko patikrinti Optimum API Key."));
//       await refreshOptimumMeta();
//     } finally { setOptimumSaving(false); }
//   };

//   const testOptimumKey = async () => {
//     setOptimumTesting(true); setOptimumError(""); setOptimumSuccess(false);
//     try {
//       const { data } = await api.post("/settings/optimum/", {}, { withCredentials: true });
//       setOptimumMeta({
//         has_key: !!data?.has_key, key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null, last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null, last_error: data?.last_error ?? "",
//       });
//       setOptimumSuccess(true); setTimeout(() => setOptimumSuccess(false), 2500);
//     } catch (e) {
//       setOptimumError(extractMsg(e, "Nepavyko patikrinti Optimum API Key."));
//       await refreshOptimumMeta();
//     } finally { setOptimumTesting(false); }
//   };

//   const deleteOptimumKey = async () => {
//     if (!window.confirm("Ar tikrai norite ištrinti Optimum API raktą?")) return;
//     setOptimumDeleting(true); setOptimumError(""); setOptimumSuccess(false);
//     try {
//       await api.delete("/settings/optimum/", { withCredentials: true });
//       setOptimumMeta({ has_key: false, key_suffix: "", verified_at: null, last_ok: null, last_error_at: null, last_error: "" });
//       setShowOptimumKeyInput(false); setOptimumSettings({ key: "" });
//     } catch (e) { setOptimumError(extractMsg(e, "Nepavyko ištrinti rakto.")); }
//     finally { setOptimumDeleting(false); }
//   };

//   // ═════════════════════════════════════════════════════
//   // Render
//   // ═════════════════════════════════════════════════════
//   return (
//     <Box>
//       {/* Programa */}
//       <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
//         Pasirinkite savo buhalterinę programą sąskaitų duomenų eksportui.
//       </Typography>

//       <FormControl fullWidth sx={{ mb: 2 }}>
//         <InputLabel id="inv-acc-prog-label">Buhalterinė programa</InputLabel>
//         <Select
//           labelId="inv-acc-prog-label"
//           value={program}
//           label="Buhalterinė programa"
//           onChange={handleProgramChange}
//           disabled={saving}
//           sx={{ backgroundColor: '#fff' }}
//           MenuProps={{ disableScrollLock: true }}
//         >
//           {ACCOUNTING_PROGRAMS.map((p) => (
//             <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
//           ))}
//         </Select>
//       </FormControl>

//       {success && <Alert severity="success" sx={{ mb: 2 }}>Išsaugota!</Alert>}

//       {/* Dineta API */}
//       {program === "dineta" && (
//         <Box sx={{ mb: 2 }}>
//           <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
//             <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
//               Dineta API sąsajos nustatymai
//             </Typography>
//             <Tooltip arrow enterTouchDelay={0} leaveTouchDelay={4000}
//               title="Čia suvedami duomenys, naudojami jungiantis prie Dineta API.">
//               <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
//             </Tooltip>
//           </Box>
//           <Grid2 container spacing={2}>
//             <Grid2 size={12}>
//               <TextField label="Dineta nuoroda" value={dinetaSettings.url}
//                 onChange={(e) => setDinetaSettings(prev => ({ ...prev, url: e.target.value }))}
//                 fullWidth required disabled={dinetaLoading || dinetaSaving}
//                 placeholder="https://lt4.dineta.eu/dokskenas/"
//                 sx={{ backgroundColor: '#fff' }} />
//             </Grid2>
//             <Grid2 size={{ xs: 12, md: 6 }}>
//               <TextField label="API naudotojo vardas" value={dinetaSettings.username}
//                 onChange={(e) => setDinetaSettings(prev => ({ ...prev, username: e.target.value }))}
//                 fullWidth required disabled={dinetaLoading || dinetaSaving}
//                 sx={{ backgroundColor: '#fff' }} />
//             </Grid2>
//             <Grid2 size={{ xs: 12, md: 6 }}>
//               <TextField label="API slaptažodis" type="password" value={dinetaSettings.password}
//                 onChange={(e) => setDinetaSettings(prev => ({ ...prev, password: e.target.value }))}
//                 onFocus={(e) => { if (e.target.value === "••••••••") setDinetaSettings(prev => ({ ...prev, password: "" })); }}
//                 onBlur={(e) => { if (!e.target.value) setDinetaSettings(prev => ({ ...prev, password: "••••••••" })); }}
//                 fullWidth required disabled={dinetaLoading || dinetaSaving}
//                 sx={{ backgroundColor: '#fff' }} />
//             </Grid2>
//           </Grid2>
//           <Box sx={{ mt: 2 }}>
//             <Button variant="contained" onClick={saveDinetaSettings} disabled={dinetaSaving || dinetaLoading}>
//               Išsaugoti API nustatymus
//             </Button>
//           </Box>
//           {dinetaError && <Alert severity={dinetaSuccess ? "warning" : "error"} sx={{ mt: 2 }}>{dinetaError}</Alert>}
//           {dinetaSuccess && <Alert severity="success" sx={{ mt: 2 }}>Dineta nustatymai išsaugoti!</Alert>}
//         </Box>
//       )}

//       {/* Optimum API */}
//       {program === "optimum" && (
//         <Box sx={{ mb: 2 }}>
//           <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
//             <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Optimum API sąsajos nustatymai</Typography>
//             <Tooltip arrow enterTouchDelay={0} leaveTouchDelay={4000}
//               title="Įveskite Optimum API Key, kurį rasite savo Optimum programoje.">
//               <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
//             </Tooltip>
//           </Box>

//           {optimumMeta.has_key && !showOptimumKeyInput ? (
//             <Box>
//               <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
//                 <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
//                   <Typography variant="body2" sx={{ color: "text.secondary" }}>API raktas:</Typography>
//                   <Typography variant="body1" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
//                     {"••••••••" + (optimumMeta.key_suffix || "****")}
//                   </Typography>
//                 </Box>
//                 <Chip size="small"
//                   label={optimumMeta.last_ok === true ? "Patikrintas ✓" : optimumMeta.last_ok === false ? "Klaida ✗" : "Nepatikrintas"}
//                   sx={{
//                     fontWeight: 600,
//                     backgroundColor: optimumMeta.last_ok === true ? alpha("#4caf50", 0.1) : optimumMeta.last_ok === false ? alpha("#f44336", 0.1) : alpha("#ff9800", 0.1),
//                     color: optimumMeta.last_ok === true ? "success.dark" : optimumMeta.last_ok === false ? "error.dark" : "warning.dark",
//                     border: "1px solid",
//                     borderColor: optimumMeta.last_ok === true ? "success.main" : optimumMeta.last_ok === false ? "error.main" : "warning.main",
//                   }}
//                 />
//               </Box>
//               {optimumMeta.verified_at && (
//                 <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
//                   Paskutinis patikrinimas: {new Date(optimumMeta.verified_at).toLocaleString("lt-LT")}
//                 </Typography>
//               )}
//               {optimumMeta.last_ok === false && optimumMeta.last_error && (
//                 <Alert severity="error" sx={{ mb: 2 }}>{optimumMeta.last_error}</Alert>
//               )}
//               <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
//                 <Button variant="outlined" onClick={testOptimumKey} disabled={optimumTesting || optimumDeleting}>
//                   {optimumTesting ? "Tikrinama..." : "Patikrinti API"}
//                 </Button>
//                 <Button variant="outlined" onClick={() => { setShowOptimumKeyInput(true); setOptimumError(""); setOptimumSuccess(false); }}
//                   disabled={optimumTesting || optimumDeleting}>
//                   Pakeisti raktą
//                 </Button>
//                 <Button variant="outlined" color="error" onClick={deleteOptimumKey}
//                   disabled={optimumTesting || optimumDeleting} startIcon={<DeleteOutlineIcon />}>
//                   {optimumDeleting ? "Trinama..." : "Ištrinti"}
//                 </Button>
//               </Stack>
//             </Box>
//           ) : (
//             <Box>
//               <Grid2 container spacing={2}>
//                 <Grid2 size={{ xs: 12, md: 8 }}>
//                   <TextField label="API Key" value={optimumSettings.key}
//                     onChange={(e) => { setOptimumSettings(prev => ({ ...prev, key: e.target.value })); setOptimumSuccess(false); setOptimumError(""); }}
//                     fullWidth required disabled={optimumSaving} placeholder="Įveskite Optimum API raktą"
//                     sx={{ backgroundColor: '#fff' }} />
//                 </Grid2>
//               </Grid2>
//               <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
//                 <Button variant="contained" onClick={saveOptimumSettings} disabled={optimumSaving}>
//                   {optimumSaving ? "Tikrinama..." : "Išsaugoti ir patikrinti"}
//                 </Button>
//                 {showOptimumKeyInput && optimumMeta.has_key && (
//                   <Button variant="outlined" onClick={() => { setShowOptimumKeyInput(false); setOptimumSettings({ key: "" }); setOptimumError(""); }}>
//                     Atšaukti
//                   </Button>
//                 )}
//               </Stack>
//             </Box>
//           )}
//           {optimumError && <Alert severity="error" sx={{ mt: 2 }}>{optimumError}</Alert>}
//           {optimumSuccess && <Alert severity="success" sx={{ mt: 2 }}>Optimum API raktas patikrintas sėkmingai!</Alert>}
//         </Box>
//       )}

//     {!hideExtraFields && (
//         <>
//           {/* Extra fields (program-specific) */}
//           <AccountingProgramExtraSettings
//             program={program}
//             prekesAssemblyPirkimas={prekesAssemblyPirkimas}
//             prekesAssemblyPardavimas={prekesAssemblyPardavimas}
//             paslaugosAssemblyPirkimas={paslaugosAssemblyPirkimas}
//             paslaugosAssemblyPardavimas={paslaugosAssemblyPardavimas}
//             savingPrekesAssembly={savingPrekesAssembly}
//             successPrekesAssembly={successPrekesAssembly}
//             onChangePrekesAssemblyPirkimas={(e) => setPrekesAssemblyPirkimas(Number(e.target.value))}
//             onChangePrekesAssemblyPardavimas={(e) => setPrekesAssemblyPardavimas(Number(e.target.value))}
//             onChangePaslaugosAssemblyPirkimas={(e) => setPaslaugosAssemblyPirkimas(Number(e.target.value))}
//             onChangePaslaugosAssemblyPardavimas={(e) => setPaslaugosAssemblyPardavimas(Number(e.target.value))}
//             rivileErpFields={rivileErpFields} setRivileErpFields={setRivileErpFields}
//             savingRivileErp={savingRivileErp} successRivileErp={successRivileErp} errorRivileErp={errorRivileErp}
//             onSaveRivileErp={saveRivileErpFields}
//             rivileGamaFields={rivileGamaFields} setRivileGamaFields={setRivileGamaFields}
//             savingRivileGama={savingRivileGama} successRivileGama={successRivileGama} errorRivileGama={errorRivileGama}
//             onSaveRivileGama={saveRivileGamaFields}
//             butentFields={butentFields} setButentFields={setButentFields}
//             savingButent={savingButent} successButent={successButent} errorButent={errorButent}
//             onSaveButent={saveButentFields}
//             finvaldaFields={finvaldaFields} setFinvaldaFields={setFinvaldaFields}
//             savingFinvalda={savingFinvalda} successFinvalda={successFinvalda} errorFinvalda={errorFinvalda}
//             onSaveFinvalda={saveFinvaldaFields}
//             centasFields={centasFields} setCentasFields={setCentasFields}
//             savingCentas={savingCentas} successCentas={successCentas} errorCentas={errorCentas}
//             onSaveCentas={saveCentasFields}
//             pragma4Fields={pragma4Fields} setPragma4Fields={setPragma4Fields}
//             savingPragma4={savingPragma4} successPragma4={successPragma4} errorPragma4={errorPragma4}
//             onSavePragma4={savePragma4Fields}
//             dinetaFields={dinetaFields} setDinetaFields={setDinetaFields}
//             savingDineta={savingDineta} successDineta={successDineta} errorDineta={errorDineta}
//             onSaveDineta={saveDinetaFields}
//             optimumFields={optimumFields} setOptimumFields={setOptimumFields}
//             savingOptimum={savingOptimum} successOptimum={successOptimum} errorOptimum={errorOptimum}
//             onSaveOptimum={saveOptimumFields}
//             debetasFields={debetasFields} setDebetasFields={setDebetasFields}
//             savingDebetas={savingDebetas} successDebetas={successDebetas} errorDebetas={errorDebetas}
//             onSaveDebetas={saveDebetasFields}
//             pragma3Fields={pragma3Fields} setPragma3Fields={setPragma3Fields}
//             savingPragma3={savingPragma3} successPragma3={successPragma3} errorPragma3={errorPragma3}
//             onSavePragma3={savePragma3Fields}
//             siteProFields={siteProFields} setSiteProFields={setSiteProFields}
//             savingSitePro={savingSitePro} successSitePro={successSitePro} errorSitePro={errorSitePro}
//             onSaveSitePro={saveSiteProFields}
//             agnumFields={agnumFields} setAgnumFields={setAgnumFields}
//             savingAgnum={savingAgnum} successAgnum={successAgnum} errorAgnum={errorAgnum}
//             onSaveAgnum={saveAgnumFields}
//           />

//           {/* Neišskirti PVM */}
//           <FormControlLabel
//             sx={{ mt: 2 }}
//             control={
//               <Switch
//                 checked={Boolean(extraSettings && Object.prototype.hasOwnProperty.call(extraSettings, "merge_vat"))}
//                 onChange={async (e) => {
//                   const checked = e.target.checked;
//                   const prev = extraSettings || {};
//                   const next = { ...prev };
//                   if (checked) next["merge_vat"] = 1;
//                   else if ("merge_vat" in next) delete next["merge_vat"];
//                   setExtraSettings(next);
//                   try {
//                     await api.patch("/profile/", { extra_settings: next }, { withCredentials: true });
//                   } catch {
//                     setExtraSettings(prev);
//                   }
//                 }}
//               />
//             }
//             label={
//               <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
//                 <span>Neišskirti PVM eksportuojant</span>
//                 <Tooltip
//                   arrow enterTouchDelay={0} leaveTouchDelay={4000}
//                   title="Eksportuojant duomenis nebus išskiriami PVM suma ir PVM klasifikatorius. Tinka ne PVM mokėtojų apskaitai, kai reikalingos tik bendros sumos."
//                 >
//                   <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
//                 </Tooltip>
//               </Box>
//             }
//           />
//         </>
//       )}
//     </Box>
//   );
// }








// import React, { useEffect, useState } from "react";
// import {
//   Box, Typography, FormControl, InputLabel, Select, MenuItem,
//   Button, Alert, TextField, Stack, Grid2, Chip, Tooltip,
//   IconButton,
// } from "@mui/material";
// import { alpha } from "@mui/material/styles";
// import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
// import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
// import { api } from "../api/endpoints";
// import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
// import { AccountingProgramExtraSettings } from "../page_elements/AccountingProgramExtraSettings";

// /**
//  * Самодостаточный блок «Buhalterinė programa ir papildomi laukai».
//  * Загружает данные из /profile/, рендерит Select + AccountingProgramExtraSettings,
//  * сохраняет изменения обратно в /profile/ (и /settings/dineta|optimum если нужно).
//  *
//  * Можно встраивать на любую страницу без пробрасывания десятков props.
//  */
// export default function AccountingProgramBlock() {
//   const [program, setProgram] = useState("");
//   const [saving, setSaving] = useState(false);
//   const [success, setSuccess] = useState(false);

//   // ── Dineta API ──
//   const [dinetaSettings, setDinetaSettings] = useState({ url: "", username: "", password: "" });
//   const [dinetaLoading, setDinetaLoading] = useState(false);
//   const [dinetaSaving, setDinetaSaving] = useState(false);
//   const [dinetaSuccess, setDinetaSuccess] = useState(false);
//   const [dinetaError, setDinetaError] = useState("");

//   // ── Optimum API ──
//   const [optimumSettings, setOptimumSettings] = useState({ key: "" });
//   const [optimumSaving, setOptimumSaving] = useState(false);
//   const [optimumSuccess, setOptimumSuccess] = useState(false);
//   const [optimumError, setOptimumError] = useState("");
//   const [optimumMeta, setOptimumMeta] = useState({
//     has_key: false, key_suffix: "", verified_at: null,
//     last_ok: null, last_error_at: null, last_error: "",
//   });
//   const [optimumTesting, setOptimumTesting] = useState(false);
//   const [optimumDeleting, setOptimumDeleting] = useState(false);
//   const [showOptimumKeyInput, setShowOptimumKeyInput] = useState(false);

//   // ── Rivile ERP ──
//   const [rivileErpFields, setRivileErpFields] = useState({
//     pirkimas_zurnalo_kodas: "", pirkimas_padalinio_kodas: "", pirkimas_objekto_kodas: "",
//     pardavimas_zurnalo_kodas: "", pardavimas_padalinio_kodas: "", pardavimas_objekto_kodas: "",
//   });
//   const [savingRivileErp, setSavingRivileErp] = useState(false);
//   const [successRivileErp, setSuccessRivileErp] = useState(false);
//   const [errorRivileErp, setErrorRivileErp] = useState("");

//   // ── Rivile Gama ──
//   const [rivileGamaFields, setRivileGamaFields] = useState({
//     pirkimas_padalinys: "", pirkimas_objektas: "", pirkimas_serija: "",
//     pirkimas_centras: "", pirkimas_atskaitingas_asmuo: "", pirkimas_logistika: "",
//     pirkimas_pinigu_saskaitos_kodas: "", pirkimas_saskaitos_rysio_kodas: "",
//     pirkimas_prekes_grupe: "", pirkimas_paslaugos_grupe: "", pirkimas_kodo_grupe: "",
//     pardavimas_padalinys: "", pardavimas_objektas: "", pardavimas_serija: "",
//     pardavimas_centras: "", pardavimas_atskaitingas_asmuo: "", pardavimas_logistika: "",
//     pardavimas_pinigu_saskaitos_kodas: "", pardavimas_saskaitos_rysio_kodas: "",
//     pardavimas_prekes_grupe: "", pardavimas_paslaugos_grupe: "", pardavimas_kodo_grupe: "",
//   });
//   const [savingRivileGama, setSavingRivileGama] = useState(false);
//   const [successRivileGama, setSuccessRivileGama] = useState(false);
//   const [errorRivileGama, setErrorRivileGama] = useState("");

//   // ── Assembly (Rivile Gama) ──
//   const [prekesAssemblyPirkimas, setPrekesAssemblyPirkimas] = useState(1);
//   const [prekesAssemblyPardavimas, setPrekesAssemblyPardavimas] = useState(1);
//   const [paslaugosAssemblyPirkimas, setPaslaugosAssemblyPirkimas] = useState(1);
//   const [paslaugosAssemblyPardavimas, setPaslaugosAssemblyPardavimas] = useState(1);
//   const [savingPrekesAssembly] = useState(false);
//   const [successPrekesAssembly] = useState(false);

//   // ── Butent ──
//   const [butentFields, setButentFields] = useState({
//     pirkimas_sandelis: "", pirkimas_operacija: "",
//     pardavimas_sandelis: "", pardavimas_operacija: "",
//   });
//   const [savingButent, setSavingButent] = useState(false);
//   const [successButent, setSuccessButent] = useState(false);
//   const [errorButent, setErrorButent] = useState("");

//   // ── Finvalda ──
//   const [finvaldaFields, setFinvaldaFields] = useState({
//     pirkimas_sandelis: "", pirkimas_tipas: "", pirkimas_zurnalas: "",
//     pirkimas_padalinys: "", pirkimas_darbuotojas: "",
//     pardavimas_sandelis: "", pardavimas_tipas: "", pardavimas_zurnalas: "",
//     pardavimas_padalinys: "", pardavimas_darbuotojas: "",
//   });
//   const [savingFinvalda, setSavingFinvalda] = useState(false);
//   const [successFinvalda, setSuccessFinvalda] = useState(false);
//   const [errorFinvalda, setErrorFinvalda] = useState("");

//   // ── Centas ──
//   const [centasFields, setCentasFields] = useState({
//     pirkimas_sandelis: "", pirkimas_kastu_centras: "",
//     pardavimas_sandelis: "", pardavimas_kastu_centras: "",
//   });
//   const [savingCentas, setSavingCentas] = useState(false);
//   const [successCentas, setSuccessCentas] = useState(false);
//   const [errorCentas, setErrorCentas] = useState("");

//   // ── Pragma4 ──
//   const [pragma4Fields, setPragma4Fields] = useState({
//     pirk_sandelio_kodas: "", pirk_projekto_kodas: "", pirk_centro_kodas: "", pirk_dk_schemos_kodas: "",
//     pard_sandelio_kodas: "", pard_projekto_kodas: "", pard_centro_kodas: "", pard_dk_schemos_kodas: "",
//   });
//   const [savingPragma4, setSavingPragma4] = useState(false);
//   const [successPragma4, setSuccessPragma4] = useState(false);
//   const [errorPragma4, setErrorPragma4] = useState("");

//   // ── Dineta extra ──
//   const [dinetaFields, setDinetaFields] = useState({
//     pirk_sandelio_kodas: "", pard_sandelio_kodas: "",
//   });
//   const [savingDineta, setSavingDineta] = useState(false);
//   const [successDineta, setSuccessDineta] = useState(false);
//   const [errorDineta, setErrorDineta] = useState("");

//   // ── Optimum extra ──
//   const [optimumFields, setOptimumFields] = useState({
//     pirk_prekes_tipas: "", pirk_prekes_grupe: "", pirk_sandelio_kodas: "",
//     pirk_skyriaus_kodas: "", pirk_projekto_kodas: "", pirk_atsakingo_darb_kodas: "",
//     tiekejo_grupe: "",
//     pard_prekes_tipas: "", pard_prekes_grupe: "", pard_sandelio_kodas: "",
//     pard_skyriaus_kodas: "", pard_projekto_kodas: "", pard_atsakingo_darb_kodas: "",
//     pirkejo_grupe: "",
//   });
//   const [savingOptimum, setSavingOptimum] = useState(false);
//   const [successOptimum, setSuccessOptimum] = useState(false);
//   const [errorOptimum, setErrorOptimum] = useState("");

//   // ── Debetas ──
//   const [debetasFields, setDebetasFields] = useState({
//     pirkimas_filialas: "", pirkimas_padalinys: "", pirkimas_objektas: "",
//     pirkimas_materialiai_atsakingas_asmuo: "", pirkimas_atskaitingas_asmuo: "",
//     pardavimas_filialas: "", pardavimas_padalinys: "", pardavimas_objektas: "",
//     pardavimas_materialiai_atsakingas_asmuo: "", pardavimas_atskaitingas_asmuo: "",
//   });
//   const [savingDebetas, setSavingDebetas] = useState(false);
//   const [successDebetas, setSuccessDebetas] = useState(false);
//   const [errorDebetas, setErrorDebetas] = useState("");

//   // ── Pragma3 ──
//   const [pragma3Fields, setPragma3Fields] = useState({
//     pirkimas_sandelis: "", pirkimas_korespondencija: "", pirkimas_projektas: "",
//     pardavimas_sandelis: "", pardavimas_korespondencija: "", pardavimas_projektas: "",
//   });
//   const [savingPragma3, setSavingPragma3] = useState(false);
//   const [successPragma3, setSuccessPragma3] = useState(false);
//   const [errorPragma3, setErrorPragma3] = useState("");

//   // ── Site.pro ──
//   const [siteProFields, setSiteProFields] = useState({
//     pirkimas_prekes_grupe: "", pirkimas_sandelis: "", pirkimas_darbuotojas: "", pirkimas_kastu_centras: "",
//     pardavimas_prekes_grupe: "", pardavimas_sandelis: "", pardavimas_darbuotojas: "", pardavimas_kastu_centras: "",
//   });
//   const [savingSitePro, setSavingSitePro] = useState(false);
//   const [successSitePro, setSuccessSitePro] = useState(false);
//   const [errorSitePro, setErrorSitePro] = useState("");

//   // ── Agnum ──
//   const [agnumFields, setAgnumFields] = useState({
//     pirkimas_sandelis: "", pirkimas_grupe: "", pirkimas_objektas: "",
//     pardavimas_sandelis: "", pardavimas_grupe: "", pardavimas_objektas: "",
//   });
//   const [savingAgnum, setSavingAgnum] = useState(false);
//   const [successAgnum, setSuccessAgnum] = useState(false);
//   const [errorAgnum, setErrorAgnum] = useState("");

//   // ═════════════════════════════════════════════════════
//   // Helper: извлечь сообщение об ошибке
//   // ═════════════════════════════════════════════════════
//   const extractMsg = (e, fallback) => {
//     const data = e?.response?.data;
//     let msg = data?.detail || data?.non_field_errors || data?.error || fallback;
//     if (Array.isArray(msg)) msg = msg.join(", ");
//     if (typeof msg === "object") {
//       try { msg = JSON.stringify(msg); } catch { msg = fallback; }
//     }
//     return String(msg || fallback);
//   };

//   // ═════════════════════════════════════════════════════
//   // Load profile
//   // ═════════════════════════════════════════════════════
//   useEffect(() => {
//     api.get("/profile/", { withCredentials: true }).then(({ data }) => {
//       setProgram(data.default_accounting_program || "");

//       // Rivile ERP
//       const ref = data.rivile_erp_extra_fields || {};
//       setRivileErpFields({
//         pirkimas_zurnalo_kodas: ref.pirkimas_zurnalo_kodas || "",
//         pirkimas_padalinio_kodas: ref.pirkimas_padalinio_kodas || "",
//         pirkimas_objekto_kodas: ref.pirkimas_objekto_kodas || "",
//         pardavimas_zurnalo_kodas: ref.pardavimas_zurnalo_kodas || "",
//         pardavimas_padalinio_kodas: ref.pardavimas_padalinio_kodas || "",
//         pardavimas_objekto_kodas: ref.pardavimas_objekto_kodas || "",
//       });

//       // Rivile Gama
//       const gama = data.rivile_gama_extra_fields || {};
//       setRivileGamaFields({
//         pirkimas_padalinys: gama.pirkimas_padalinys || "",
//         pirkimas_objektas: gama.pirkimas_objektas || "",
//         pirkimas_serija: gama.pirkimas_serija || "",
//         pirkimas_centras: gama.pirkimas_centras || "",
//         pirkimas_atskaitingas_asmuo: gama.pirkimas_atskaitingas_asmuo || "",
//         pirkimas_logistika: gama.pirkimas_logistika || "",
//         pirkimas_pinigu_saskaitos_kodas: gama.pirkimas_pinigu_saskaitos_kodas || "",
//         pirkimas_saskaitos_rysio_kodas: gama.pirkimas_saskaitos_rysio_kodas || "",
//         pirkimas_prekes_grupe: gama.pirkimas_prekes_grupe || "",
//         pirkimas_paslaugos_grupe: gama.pirkimas_paslaugos_grupe || "",
//         pirkimas_kodo_grupe: gama.pirkimas_kodo_grupe || "",
//         pardavimas_padalinys: gama.pardavimas_padalinys || "",
//         pardavimas_objektas: gama.pardavimas_objektas || "",
//         pardavimas_serija: gama.pardavimas_serija || "",
//         pardavimas_centras: gama.pardavimas_centras || "",
//         pardavimas_atskaitingas_asmuo: gama.pardavimas_atskaitingas_asmuo || "",
//         pardavimas_logistika: gama.pardavimas_logistika || "",
//         pardavimas_pinigu_saskaitos_kodas: gama.pardavimas_pinigu_saskaitos_kodas || "",
//         pardavimas_saskaitos_rysio_kodas: gama.pardavimas_saskaitos_rysio_kodas || "",
//         pardavimas_prekes_grupe: gama.pardavimas_prekes_grupe || "",
//         pardavimas_paslaugos_grupe: gama.pardavimas_paslaugos_grupe || "",
//         pardavimas_kodo_grupe: gama.pardavimas_kodo_grupe || "",
//       });
//       setPrekesAssemblyPirkimas(gama.prekes_assembly_pirkimas != null ? Number(gama.prekes_assembly_pirkimas) : 1);
//       setPrekesAssemblyPardavimas(gama.prekes_assembly_pardavimas != null ? Number(gama.prekes_assembly_pardavimas) : 1);
//       setPaslaugosAssemblyPirkimas(gama.paslaugos_assembly_pirkimas != null ? Number(gama.paslaugos_assembly_pirkimas) : 1);
//       setPaslaugosAssemblyPardavimas(gama.paslaugos_assembly_pardavimas != null ? Number(gama.paslaugos_assembly_pardavimas) : 1);

//       // Butent
//       const butent = data.butent_extra_fields || {};
//       setButentFields({
//         pirkimas_sandelis: butent.pirkimas_sandelis || "", pirkimas_operacija: butent.pirkimas_operacija || "",
//         pardavimas_sandelis: butent.pardavimas_sandelis || "", pardavimas_operacija: butent.pardavimas_operacija || "",
//       });

//       // Finvalda
//       const fin = data.finvalda_extra_fields || {};
//       setFinvaldaFields({
//         pirkimas_sandelis: fin.pirkimas_sandelis || "", pirkimas_tipas: fin.pirkimas_tipas || "",
//         pirkimas_zurnalas: fin.pirkimas_zurnalas || "", pirkimas_padalinys: fin.pirkimas_padalinys || "",
//         pirkimas_darbuotojas: fin.pirkimas_darbuotojas || "",
//         pardavimas_sandelis: fin.pardavimas_sandelis || "", pardavimas_tipas: fin.pardavimas_tipas || "",
//         pardavimas_zurnalas: fin.pardavimas_zurnalas || "", pardavimas_padalinys: fin.pardavimas_padalinys || "",
//         pardavimas_darbuotojas: fin.pardavimas_darbuotojas || "",
//       });

//       // Centas
//       const cent = data.centas_extra_fields || {};
//       setCentasFields({
//         pirkimas_sandelis: cent.pirkimas_sandelis || "", pirkimas_kastu_centras: cent.pirkimas_kastu_centras || "",
//         pardavimas_sandelis: cent.pardavimas_sandelis || "", pardavimas_kastu_centras: cent.pardavimas_kastu_centras || "",
//       });

//       // Pragma4
//       const pragma4 = data.pragma4_extra_fields || {};
//       setPragma4Fields({
//         pirk_sandelio_kodas: pragma4.pirk_sandelio_kodas || "", pirk_projekto_kodas: pragma4.pirk_projekto_kodas || "",
//         pirk_centro_kodas: pragma4.pirk_centro_kodas || "", pirk_dk_schemos_kodas: pragma4.pirk_dk_schemos_kodas || "",
//         pard_sandelio_kodas: pragma4.pard_sandelio_kodas || "", pard_projekto_kodas: pragma4.pard_projekto_kodas || "",
//         pard_centro_kodas: pragma4.pard_centro_kodas || "", pard_dk_schemos_kodas: pragma4.pard_dk_schemos_kodas || "",
//       });

//       // Dineta extra
//       const dineta = data.dineta_extra_fields || {};
//       setDinetaFields({
//         pirk_sandelio_kodas: dineta.pirk_sandelio_kodas || "",
//         pard_sandelio_kodas: dineta.pard_sandelio_kodas || "",
//       });

//       // Optimum extra
//       const optimum = data.optimum_extra_fields || {};
//       setOptimumFields({
//         pirk_prekes_tipas: optimum.pirk_prekes_tipas || "", pirk_prekes_grupe: optimum.pirk_prekes_grupe || "",
//         pirk_sandelio_kodas: optimum.pirk_sandelio_kodas || "", pirk_skyriaus_kodas: optimum.pirk_skyriaus_kodas || "",
//         pirk_projekto_kodas: optimum.pirk_projekto_kodas || "", pirk_atsakingo_darb_kodas: optimum.pirk_atsakingo_darb_kodas || "",
//         tiekejo_grupe: optimum.tiekejo_grupe || "",
//         pard_prekes_tipas: optimum.pard_prekes_tipas || "", pard_prekes_grupe: optimum.pard_prekes_grupe || "",
//         pard_sandelio_kodas: optimum.pard_sandelio_kodas || "", pard_skyriaus_kodas: optimum.pard_skyriaus_kodas || "",
//         pard_projekto_kodas: optimum.pard_projekto_kodas || "", pard_atsakingo_darb_kodas: optimum.pard_atsakingo_darb_kodas || "",
//         pirkejo_grupe: optimum.pirkejo_grupe || "",
//       });

//       // Debetas
//       const debetas = data.debetas_extra_fields || {};
//       setDebetasFields({
//         pirkimas_filialas: debetas.pirkimas_filialas || "", pirkimas_padalinys: debetas.pirkimas_padalinys || "",
//         pirkimas_objektas: debetas.pirkimas_objektas || "",
//         pirkimas_materialiai_atsakingas_asmuo: debetas.pirkimas_materialiai_atsakingas_asmuo || "",
//         pirkimas_atskaitingas_asmuo: debetas.pirkimas_atskaitingas_asmuo || "",
//         pardavimas_filialas: debetas.pardavimas_filialas || "", pardavimas_padalinys: debetas.pardavimas_padalinys || "",
//         pardavimas_objektas: debetas.pardavimas_objektas || "",
//         pardavimas_materialiai_atsakingas_asmuo: debetas.pardavimas_materialiai_atsakingas_asmuo || "",
//         pardavimas_atskaitingas_asmuo: debetas.pardavimas_atskaitingas_asmuo || "",
//       });

//       // Pragma3
//       const pragma3 = data.pragma3_extra_fields || {};
//       setPragma3Fields({
//         pirkimas_sandelis: pragma3.pirkimas_sandelis || "", pirkimas_korespondencija: pragma3.pirkimas_korespondencija || "",
//         pirkimas_projektas: pragma3.pirkimas_projektas || "",
//         pardavimas_sandelis: pragma3.pardavimas_sandelis || "", pardavimas_korespondencija: pragma3.pardavimas_korespondencija || "",
//         pardavimas_projektas: pragma3.pardavimas_projektas || "",
//       });

//       // Site.pro
//       const sitePro = data.site_pro_extra_fields || {};
//       setSiteProFields({
//         pirkimas_prekes_grupe: sitePro.pirkimas_prekes_grupe || "", pirkimas_sandelis: sitePro.pirkimas_sandelis || "",
//         pirkimas_darbuotojas: sitePro.pirkimas_darbuotojas || "", pirkimas_kastu_centras: sitePro.pirkimas_kastu_centras || "",
//         pardavimas_prekes_grupe: sitePro.pardavimas_prekes_grupe || "", pardavimas_sandelis: sitePro.pardavimas_sandelis || "",
//         pardavimas_darbuotojas: sitePro.pardavimas_darbuotojas || "", pardavimas_kastu_centras: sitePro.pardavimas_kastu_centras || "",
//       });

//       // Agnum
//       const agn = data.agnum_extra_fields || {};
//       setAgnumFields({
//         pirkimas_sandelis: agn.pirkimas_sandelis || "", pirkimas_grupe: agn.pirkimas_grupe || "",
//         pirkimas_objektas: agn.pirkimas_objektas || "",
//         pardavimas_sandelis: agn.pardavimas_sandelis || "", pardavimas_grupe: agn.pardavimas_grupe || "",
//         pardavimas_objektas: agn.pardavimas_objektas || "",
//       });
//     });
//   }, []);

//   // ── Load Dineta API settings ──
//   useEffect(() => {
//     if (program !== "dineta") return;
//     setDinetaLoading(true);
//     setDinetaError("");
//     api.get("/settings/dineta/", { withCredentials: true })
//       .then(({ data }) => {
//         setDinetaSettings({
//           url: data?.url || "", username: data?.username || "", password: data?.password || "",
//         });
//       })
//       .catch(() => {})
//       .finally(() => setDinetaLoading(false));
//   }, [program]);

//   // ── Load Optimum meta ──
//   useEffect(() => {
//     if (program !== "optimum") return;
//     refreshOptimumMeta();
//   }, [program]);

//   const refreshOptimumMeta = async () => {
//     try {
//       const { data } = await api.get("/settings/optimum/", { withCredentials: true });
//       setOptimumMeta({
//         has_key: !!data?.has_key, key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null, last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null, last_error: data?.last_error ?? "",
//       });
//     } catch {}
//   };

//   // ═════════════════════════════════════════════════════
//   // Save handlers
//   // ═════════════════════════════════════════════════════
//   const handleProgramChange = async (e) => {
//     const v = e.target.value;
//     setProgram(v);
//     setSaving(true);
//     try {
//       await api.patch("/profile/", { default_accounting_program: v }, { withCredentials: true });
//       setSuccess(true);
//       setTimeout(() => setSuccess(false), 2000);
//     } catch {}
//     finally { setSaving(false); }
//   };

//   const makeExtraSaver = (fieldName, setFields, setSaving, setSuccess, setError, fallback) =>
//     async () => {
//       setSaving(true); setError("");
//       try {
//         const payload = {};
//         // Для Rivile Gama: объединяем с assembly
//         if (fieldName === "rivile_gama_extra_fields") {
//           payload[fieldName] = {
//             ...rivileGamaFields,
//             prekes_assembly_pirkimas: prekesAssemblyPirkimas,
//             prekes_assembly_pardavimas: prekesAssemblyPardavimas,
//             paslaugos_assembly_pirkimas: paslaugosAssemblyPirkimas,
//             paslaugos_assembly_pardavimas: paslaugosAssemblyPardavimas,
//           };
//         } else {
//           // Для остальных — берём текущее значение стейта напрямую
//           // (передаётся через замыкание в вызывающем коде)
//         }
//         // Этот вариант не сработает универсально,
//         // поэтому реализуем каждый сейвер отдельно ниже.
//       } catch (e) {
//         setError(extractMsg(e, fallback));
//       } finally { setSaving(false); }
//     };

//   // Индивидуальные сейверы (каждый знает свои поля)
//   const saveRivileErpFields = async () => {
//     setSavingRivileErp(true); setErrorRivileErp("");
//     try {
//       await api.patch("/profile/", { rivile_erp_extra_fields: rivileErpFields }, { withCredentials: true });
//       setSuccessRivileErp(true); setTimeout(() => setSuccessRivileErp(false), 2000);
//     } catch (e) { setErrorRivileErp(extractMsg(e, "Nepavyko išsaugoti Rivilė ERP nustatymų.")); }
//     finally { setSavingRivileErp(false); }
//   };

//   const saveRivileGamaFields = async () => {
//     setSavingRivileGama(true); setErrorRivileGama("");
//     try {
//       await api.patch("/profile/", {
//         rivile_gama_extra_fields: {
//           ...rivileGamaFields,
//           prekes_assembly_pirkimas: prekesAssemblyPirkimas,
//           prekes_assembly_pardavimas: prekesAssemblyPardavimas,
//           paslaugos_assembly_pirkimas: paslaugosAssemblyPirkimas,
//           paslaugos_assembly_pardavimas: paslaugosAssemblyPardavimas,
//         },
//       }, { withCredentials: true });
//       setSuccessRivileGama(true); setTimeout(() => setSuccessRivileGama(false), 2000);
//     } catch (e) { setErrorRivileGama(extractMsg(e, "Nepavyko išsaugoti Rivilė Gama nustatymų.")); }
//     finally { setSavingRivileGama(false); }
//   };

//   const saveButentFields = async () => {
//     setSavingButent(true); setErrorButent("");
//     try {
//       await api.patch("/profile/", { butent_extra_fields: butentFields }, { withCredentials: true });
//       setSuccessButent(true); setTimeout(() => setSuccessButent(false), 2000);
//     } catch (e) { setErrorButent(extractMsg(e, "Nepavyko išsaugoti Butent nustatymų.")); }
//     finally { setSavingButent(false); }
//   };

//   const saveFinvaldaFields = async () => {
//     setSavingFinvalda(true); setErrorFinvalda("");
//     try {
//       await api.patch("/profile/", { finvalda_extra_fields: finvaldaFields }, { withCredentials: true });
//       setSuccessFinvalda(true); setTimeout(() => setSuccessFinvalda(false), 2000);
//     } catch (e) { setErrorFinvalda(extractMsg(e, "Nepavyko išsaugoti Finvalda nustatymų.")); }
//     finally { setSavingFinvalda(false); }
//   };

//   const saveCentasFields = async () => {
//     setSavingCentas(true); setErrorCentas("");
//     try {
//       await api.patch("/profile/", { centas_extra_fields: centasFields }, { withCredentials: true });
//       setSuccessCentas(true); setTimeout(() => setSuccessCentas(false), 2000);
//     } catch (e) { setErrorCentas(extractMsg(e, "Nepavyko išsaugoti Centas nustatymų.")); }
//     finally { setSavingCentas(false); }
//   };

//   const savePragma4Fields = async () => {
//     setSavingPragma4(true); setErrorPragma4("");
//     try {
//       await api.patch("/profile/", { pragma4_extra_fields: pragma4Fields }, { withCredentials: true });
//       setSuccessPragma4(true); setTimeout(() => setSuccessPragma4(false), 2000);
//     } catch (e) { setErrorPragma4(extractMsg(e, "Nepavyko išsaugoti Pragma4 nustatymų.")); }
//     finally { setSavingPragma4(false); }
//   };

//   const saveDinetaFields = async () => {
//     setSavingDineta(true); setErrorDineta("");
//     try {
//       await api.patch("/profile/", { dineta_extra_fields: dinetaFields }, { withCredentials: true });
//       setSuccessDineta(true); setTimeout(() => setSuccessDineta(false), 2000);
//     } catch (e) { setErrorDineta(extractMsg(e, "Nepavyko išsaugoti Dineta nustatymų.")); }
//     finally { setSavingDineta(false); }
//   };

//   const saveOptimumFields = async () => {
//     setSavingOptimum(true); setErrorOptimum("");
//     try {
//       await api.patch("/profile/", { optimum_extra_fields: optimumFields }, { withCredentials: true });
//       setSuccessOptimum(true); setTimeout(() => setSuccessOptimum(false), 2000);
//     } catch (e) { setErrorOptimum(extractMsg(e, "Nepavyko išsaugoti Optimum nustatymų.")); }
//     finally { setSavingOptimum(false); }
//   };

//   const saveDebetasFields = async () => {
//     setSavingDebetas(true); setErrorDebetas("");
//     try {
//       await api.patch("/profile/", { debetas_extra_fields: debetasFields }, { withCredentials: true });
//       setSuccessDebetas(true); setTimeout(() => setSuccessDebetas(false), 2000);
//     } catch (e) { setErrorDebetas(extractMsg(e, "Nepavyko išsaugoti Debetas nustatymų.")); }
//     finally { setSavingDebetas(false); }
//   };

//   const savePragma3Fields = async () => {
//     setSavingPragma3(true); setErrorPragma3("");
//     try {
//       await api.patch("/profile/", { pragma3_extra_fields: pragma3Fields }, { withCredentials: true });
//       setSuccessPragma3(true); setTimeout(() => setSuccessPragma3(false), 2000);
//     } catch (e) { setErrorPragma3(extractMsg(e, "Nepavyko išsaugoti Pragma 3 nustatymų.")); }
//     finally { setSavingPragma3(false); }
//   };

//   const saveSiteProFields = async () => {
//     setSavingSitePro(true); setErrorSitePro("");
//     try {
//       await api.patch("/profile/", { site_pro_extra_fields: siteProFields }, { withCredentials: true });
//       setSuccessSitePro(true); setTimeout(() => setSuccessSitePro(false), 2000);
//     } catch (e) { setErrorSitePro(extractMsg(e, "Nepavyko išsaugoti Site.pro nustatymų.")); }
//     finally { setSavingSitePro(false); }
//   };

//   const saveAgnumFields = async () => {
//     setSavingAgnum(true); setErrorAgnum("");
//     try {
//       await api.patch("/profile/", { agnum_extra_fields: agnumFields }, { withCredentials: true });
//       setSuccessAgnum(true); setTimeout(() => setSuccessAgnum(false), 2000);
//     } catch (e) { setErrorAgnum(extractMsg(e, "Nepavyko išsaugoti Agnum nustatymų.")); }
//     finally { setSavingAgnum(false); }
//   };

//   // ── Dineta API save ──
//   const saveDinetaSettings = async () => {
//     setDinetaSaving(true); setDinetaError(""); setDinetaSuccess(false);
//     const { url, username, password } = dinetaSettings;
//     if (!url.trim() || !username.trim() || !password) {
//       setDinetaError("Visi API laukai yra privalomi.");
//       setDinetaSaving(false); return;
//     }
//     try {
//       const { data } = await api.put("/settings/dineta/", { url, username, password }, { withCredentials: true });
//       setDinetaSettings(prev => ({
//         ...prev, url: data?.url || prev.url, username: data?.username || prev.username,
//         password: data?.password || "••••••••",
//       }));
//       if (data?.connection_status === "warning") {
//         setDinetaError(data.connection_message || "Prisijungimo patikrinimas nepavyko.");
//       }
//       setDinetaSuccess(true); setTimeout(() => setDinetaSuccess(false), 3000);
//     } catch (e) { setDinetaError(extractMsg(e, "Nepavyko išsaugoti Dineta nustatymų.")); }
//     finally { setDinetaSaving(false); }
//   };

//   // ── Optimum API save / test / delete ──
//   const saveOptimumSettings = async () => {
//     setOptimumSaving(true); setOptimumError(""); setOptimumSuccess(false);
//     const key = (optimumSettings.key || "").trim();
//     if (!key) { setOptimumError("API Key yra privalomas."); setOptimumSaving(false); return; }
//     try {
//       const { data } = await api.put("/settings/optimum/", { key }, { withCredentials: true });
//       setOptimumSettings({ key: "" });
//       setOptimumMeta({
//         has_key: !!data?.has_key, key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null, last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null, last_error: data?.last_error ?? "",
//       });
//       setShowOptimumKeyInput(false);
//       setOptimumSuccess(true); setTimeout(() => setOptimumSuccess(false), 2500);
//     } catch (e) {
//       setOptimumError(extractMsg(e, "Nepavyko patikrinti Optimum API Key."));
//       await refreshOptimumMeta();
//     } finally { setOptimumSaving(false); }
//   };

//   const testOptimumKey = async () => {
//     setOptimumTesting(true); setOptimumError(""); setOptimumSuccess(false);
//     try {
//       const { data } = await api.post("/settings/optimum/", {}, { withCredentials: true });
//       setOptimumMeta({
//         has_key: !!data?.has_key, key_suffix: data?.key_suffix ?? "",
//         verified_at: data?.verified_at ?? null, last_ok: data?.last_ok ?? null,
//         last_error_at: data?.last_error_at ?? null, last_error: data?.last_error ?? "",
//       });
//       setOptimumSuccess(true); setTimeout(() => setOptimumSuccess(false), 2500);
//     } catch (e) {
//       setOptimumError(extractMsg(e, "Nepavyko patikrinti Optimum API Key."));
//       await refreshOptimumMeta();
//     } finally { setOptimumTesting(false); }
//   };

//   const deleteOptimumKey = async () => {
//     if (!window.confirm("Ar tikrai norite ištrinti Optimum API raktą?")) return;
//     setOptimumDeleting(true); setOptimumError(""); setOptimumSuccess(false);
//     try {
//       await api.delete("/settings/optimum/", { withCredentials: true });
//       setOptimumMeta({ has_key: false, key_suffix: "", verified_at: null, last_ok: null, last_error_at: null, last_error: "" });
//       setShowOptimumKeyInput(false); setOptimumSettings({ key: "" });
//     } catch (e) { setOptimumError(extractMsg(e, "Nepavyko ištrinti rakto.")); }
//     finally { setOptimumDeleting(false); }
//   };

//   // ═════════════════════════════════════════════════════
//   // Render
//   // ═════════════════════════════════════════════════════
//   return (
//     <Box>
//       {/* Programa */}
//       <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
//         Pasirinkite savo buhalterinę programą sąskaitų duomenų eksportui.
//       </Typography>

//       <FormControl fullWidth sx={{ mb: 2 }}>
//         <InputLabel id="inv-acc-prog-label">Buhalterinė programa</InputLabel>
//         <Select
//           labelId="inv-acc-prog-label"
//           value={program}
//           label="Buhalterinė programa"
//           onChange={handleProgramChange}
//           disabled={saving}
//           sx={{ backgroundColor: '#fff' }}
//           MenuProps={{ disableScrollLock: true }}
//         >
//           {ACCOUNTING_PROGRAMS.map((p) => (
//             <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
//           ))}
//         </Select>
//       </FormControl>

//       {success && <Alert severity="success" sx={{ mb: 2 }}>Išsaugota!</Alert>}

//       {/* Dineta API */}
//       {program === "dineta" && (
//         <Box sx={{ mb: 2 }}>
//           <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
//             <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
//               Dineta API sąsajos nustatymai
//             </Typography>
//             <Tooltip arrow enterTouchDelay={0} leaveTouchDelay={4000}
//               title="Čia suvedami duomenys, naudojami jungiantis prie Dineta API.">
//               <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
//             </Tooltip>
//           </Box>
//           <Grid2 container spacing={2}>
//             <Grid2 size={12}>
//               <TextField label="Dineta nuoroda" value={dinetaSettings.url}
//                 onChange={(e) => setDinetaSettings(prev => ({ ...prev, url: e.target.value }))}
//                 fullWidth required disabled={dinetaLoading || dinetaSaving}
//                 placeholder="https://lt4.dineta.eu/dokskenas/"
//                 sx={{ backgroundColor: '#fff' }} />
//             </Grid2>
//             <Grid2 size={{ xs: 12, md: 6 }}>
//               <TextField label="API naudotojo vardas" value={dinetaSettings.username}
//                 onChange={(e) => setDinetaSettings(prev => ({ ...prev, username: e.target.value }))}
//                 fullWidth required disabled={dinetaLoading || dinetaSaving}
//                 sx={{ backgroundColor: '#fff' }} />
//             </Grid2>
//             <Grid2 size={{ xs: 12, md: 6 }}>
//               <TextField label="API slaptažodis" type="password" value={dinetaSettings.password}
//                 onChange={(e) => setDinetaSettings(prev => ({ ...prev, password: e.target.value }))}
//                 onFocus={(e) => { if (e.target.value === "••••••••") setDinetaSettings(prev => ({ ...prev, password: "" })); }}
//                 onBlur={(e) => { if (!e.target.value) setDinetaSettings(prev => ({ ...prev, password: "••••••••" })); }}
//                 fullWidth required disabled={dinetaLoading || dinetaSaving}
//                 sx={{ backgroundColor: '#fff' }} />
//             </Grid2>
//           </Grid2>
//           <Box sx={{ mt: 2 }}>
//             <Button variant="contained" onClick={saveDinetaSettings} disabled={dinetaSaving || dinetaLoading}>
//               Išsaugoti API nustatymus
//             </Button>
//           </Box>
//           {dinetaError && <Alert severity={dinetaSuccess ? "warning" : "error"} sx={{ mt: 2 }}>{dinetaError}</Alert>}
//           {dinetaSuccess && <Alert severity="success" sx={{ mt: 2 }}>Dineta nustatymai išsaugoti!</Alert>}
//         </Box>
//       )}

//       {/* Optimum API */}
//       {program === "optimum" && (
//         <Box sx={{ mb: 2 }}>
//           <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
//             <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Optimum API sąsajos nustatymai</Typography>
//             <Tooltip arrow enterTouchDelay={0} leaveTouchDelay={4000}
//               title="Įveskite Optimum API Key, kurį rasite savo Optimum programoje.">
//               <HelpOutlineIcon fontSize="small" sx={{ color: "text.secondary" }} />
//             </Tooltip>
//           </Box>

//           {optimumMeta.has_key && !showOptimumKeyInput ? (
//             <Box>
//               <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
//                 <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
//                   <Typography variant="body2" sx={{ color: "text.secondary" }}>API raktas:</Typography>
//                   <Typography variant="body1" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
//                     {"••••••••" + (optimumMeta.key_suffix || "****")}
//                   </Typography>
//                 </Box>
//                 <Chip size="small"
//                   label={optimumMeta.last_ok === true ? "Patikrintas ✓" : optimumMeta.last_ok === false ? "Klaida ✗" : "Nepatikrintas"}
//                   sx={{
//                     fontWeight: 600,
//                     backgroundColor: optimumMeta.last_ok === true ? alpha("#4caf50", 0.1) : optimumMeta.last_ok === false ? alpha("#f44336", 0.1) : alpha("#ff9800", 0.1),
//                     color: optimumMeta.last_ok === true ? "success.dark" : optimumMeta.last_ok === false ? "error.dark" : "warning.dark",
//                     border: "1px solid",
//                     borderColor: optimumMeta.last_ok === true ? "success.main" : optimumMeta.last_ok === false ? "error.main" : "warning.main",
//                   }}
//                 />
//               </Box>
//               {optimumMeta.verified_at && (
//                 <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
//                   Paskutinis patikrinimas: {new Date(optimumMeta.verified_at).toLocaleString("lt-LT")}
//                 </Typography>
//               )}
//               {optimumMeta.last_ok === false && optimumMeta.last_error && (
//                 <Alert severity="error" sx={{ mb: 2 }}>{optimumMeta.last_error}</Alert>
//               )}
//               <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
//                 <Button variant="outlined" onClick={testOptimumKey} disabled={optimumTesting || optimumDeleting}>
//                   {optimumTesting ? "Tikrinama..." : "Patikrinti API"}
//                 </Button>
//                 <Button variant="outlined" onClick={() => { setShowOptimumKeyInput(true); setOptimumError(""); setOptimumSuccess(false); }}
//                   disabled={optimumTesting || optimumDeleting}>
//                   Pakeisti raktą
//                 </Button>
//                 <Button variant="outlined" color="error" onClick={deleteOptimumKey}
//                   disabled={optimumTesting || optimumDeleting} startIcon={<DeleteOutlineIcon />}>
//                   {optimumDeleting ? "Trinama..." : "Ištrinti"}
//                 </Button>
//               </Stack>
//             </Box>
//           ) : (
//             <Box>
//               <Grid2 container spacing={2}>
//                 <Grid2 size={{ xs: 12, md: 8 }}>
//                   <TextField label="API Key" value={optimumSettings.key}
//                     onChange={(e) => { setOptimumSettings(prev => ({ ...prev, key: e.target.value })); setOptimumSuccess(false); setOptimumError(""); }}
//                     fullWidth required disabled={optimumSaving} placeholder="Įveskite Optimum API raktą"
//                     sx={{ backgroundColor: '#fff' }} />
//                 </Grid2>
//               </Grid2>
//               <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
//                 <Button variant="contained" onClick={saveOptimumSettings} disabled={optimumSaving}>
//                   {optimumSaving ? "Tikrinama..." : "Išsaugoti ir patikrinti"}
//                 </Button>
//                 {showOptimumKeyInput && optimumMeta.has_key && (
//                   <Button variant="outlined" onClick={() => { setShowOptimumKeyInput(false); setOptimumSettings({ key: "" }); setOptimumError(""); }}>
//                     Atšaukti
//                   </Button>
//                 )}
//               </Stack>
//             </Box>
//           )}
//           {optimumError && <Alert severity="error" sx={{ mt: 2 }}>{optimumError}</Alert>}
//           {optimumSuccess && <Alert severity="success" sx={{ mt: 2 }}>Optimum API raktas patikrintas sėkmingai!</Alert>}
//         </Box>
//       )}

//       {/* Extra fields (program-specific) */}
//       <AccountingProgramExtraSettings
//         program={program}
//         prekesAssemblyPirkimas={prekesAssemblyPirkimas}
//         prekesAssemblyPardavimas={prekesAssemblyPardavimas}
//         paslaugosAssemblyPirkimas={paslaugosAssemblyPirkimas}
//         paslaugosAssemblyPardavimas={paslaugosAssemblyPardavimas}
//         savingPrekesAssembly={savingPrekesAssembly}
//         successPrekesAssembly={successPrekesAssembly}
//         onChangePrekesAssemblyPirkimas={(e) => setPrekesAssemblyPirkimas(Number(e.target.value))}
//         onChangePrekesAssemblyPardavimas={(e) => setPrekesAssemblyPardavimas(Number(e.target.value))}
//         onChangePaslaugosAssemblyPirkimas={(e) => setPaslaugosAssemblyPirkimas(Number(e.target.value))}
//         onChangePaslaugosAssemblyPardavimas={(e) => setPaslaugosAssemblyPardavimas(Number(e.target.value))}
//         rivileErpFields={rivileErpFields} setRivileErpFields={setRivileErpFields}
//         savingRivileErp={savingRivileErp} successRivileErp={successRivileErp} errorRivileErp={errorRivileErp}
//         onSaveRivileErp={saveRivileErpFields}
//         rivileGamaFields={rivileGamaFields} setRivileGamaFields={setRivileGamaFields}
//         savingRivileGama={savingRivileGama} successRivileGama={successRivileGama} errorRivileGama={errorRivileGama}
//         onSaveRivileGama={saveRivileGamaFields}
//         butentFields={butentFields} setButentFields={setButentFields}
//         savingButent={savingButent} successButent={successButent} errorButent={errorButent}
//         onSaveButent={saveButentFields}
//         finvaldaFields={finvaldaFields} setFinvaldaFields={setFinvaldaFields}
//         savingFinvalda={savingFinvalda} successFinvalda={successFinvalda} errorFinvalda={errorFinvalda}
//         onSaveFinvalda={saveFinvaldaFields}
//         centasFields={centasFields} setCentasFields={setCentasFields}
//         savingCentas={savingCentas} successCentas={successCentas} errorCentas={errorCentas}
//         onSaveCentas={saveCentasFields}
//         pragma4Fields={pragma4Fields} setPragma4Fields={setPragma4Fields}
//         savingPragma4={savingPragma4} successPragma4={successPragma4} errorPragma4={errorPragma4}
//         onSavePragma4={savePragma4Fields}
//         dinetaFields={dinetaFields} setDinetaFields={setDinetaFields}
//         savingDineta={savingDineta} successDineta={successDineta} errorDineta={errorDineta}
//         onSaveDineta={saveDinetaFields}
//         optimumFields={optimumFields} setOptimumFields={setOptimumFields}
//         savingOptimum={savingOptimum} successOptimum={successOptimum} errorOptimum={errorOptimum}
//         onSaveOptimum={saveOptimumFields}
//         debetasFields={debetasFields} setDebetasFields={setDebetasFields}
//         savingDebetas={savingDebetas} successDebetas={successDebetas} errorDebetas={errorDebetas}
//         onSaveDebetas={saveDebetasFields}
//         pragma3Fields={pragma3Fields} setPragma3Fields={setPragma3Fields}
//         savingPragma3={savingPragma3} successPragma3={successPragma3} errorPragma3={errorPragma3}
//         onSavePragma3={savePragma3Fields}
//         siteProFields={siteProFields} setSiteProFields={setSiteProFields}
//         savingSitePro={savingSitePro} successSitePro={successSitePro} errorSitePro={errorSitePro}
//         onSaveSitePro={saveSiteProFields}
//         agnumFields={agnumFields} setAgnumFields={setAgnumFields}
//         savingAgnum={savingAgnum} successAgnum={successAgnum} errorAgnum={errorAgnum}
//         onSaveAgnum={saveAgnumFields}
//       />
//     </Box>
//   );
// }