import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { useNavigate } from "react-router-dom";
import { api } from "../api/endpoints";
import { useCompanyProfiles } from "../contexts/useCompanyProfiles";
import { ACCOUNTING_PROGRAMS } from "../page_elements/AccountingPrograms";
import { COUNTRY_OPTIONS } from "../page_elements/Countries";

const CREATE_ENDPOINT = "company-profiles/";
const SEARCH_ENDPOINT = "company-profiles/search/";

const EMPTY_FORM = {
  entity_type: "imone",
  name: "",
  company_code: "",
  vat_code: "",
  owner_name: "",
  iv_certificate_nr: "",
  country_iso: "LT",
  accounting_program: "rivile",
  uses_inventory: false,
  address: "",
};

const TYPE_OPTIONS = [
  {
    value: "imone",
    label: "Įmonė",
    description: "UAB, MB, AB, IĮ ir kiti juridiniai asmenys",
    icon: BusinessRoundedIcon,
  },
  {
    value: "iv",
    label: "Individuali veikla",
    description: "IDV pagal pažymą",
    icon: PersonRoundedIcon,
  },
];

const programLabel = (value) =>
  ACCOUNTING_PROGRAMS.find((program) => program.value === value)?.label || value;

const normalize = (value) => String(value || "").trim().toLowerCase();

const profileTypeLabel = (entityType) =>
  entityType === "imone" ? "Įmonė" : "Individuali veikla";

let localId = 0;

export default function OnboardingCompanyProfiles() {
  const navigate = useNavigate();
  const { refresh } = useCompanyProfiles();
  const formCardRef = useRef(null);

  const [drafts, setDrafts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [creationTotal, setCreationTotal] = useState(0);
  const [createdCount, setCreatedCount] = useState(0);

  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [companySearchVersion, setCompanySearchVersion] = useState(0);

  const isCompany = form.entity_type === "imone";
  const isEditing = editingId !== null;

  const hasUnsavedInput = useMemo(() => {
    if (isEditing) return true;

    return Boolean(
      normalize(form.name) ||
        normalize(form.company_code) ||
        normalize(form.vat_code) ||
        normalize(form.owner_name) ||
        normalize(form.iv_certificate_nr) ||
        normalize(companyInput)
    );
  }, [companyInput, form, isEditing]);

  useEffect(() => {
    if (!isCompany) {
      setCompanyOptions([]);
      setCompanyLoading(false);
      return undefined;
    }

    const query = companyInput.trim();
    if (query.length < 2) {
      setCompanyOptions([]);
      return undefined;
    }

    setCompanyLoading(true);

    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(SEARCH_ENDPOINT, {
          params: { q: query },
        });
        setCompanyOptions(data.results || []);
      } catch {
        setCompanyOptions([]);
      } finally {
        setCompanyLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [companyInput, isCompany]);

  const setField = (fieldName) => (event) => {
    setError("");
    setForm((current) => ({
      ...current,
      [fieldName]: event.target.value,
    }));
  };

  const resetForm = ({ keepType = true } = {}) => {
    setForm((current) => ({
      ...EMPTY_FORM,
      entity_type: keepType ? current.entity_type : EMPTY_FORM.entity_type,
      country_iso: current.country_iso,
      accounting_program: current.accounting_program,
      uses_inventory: current.uses_inventory,
    }));
    setEditingId(null);
    setCompanyInput("");
    setCompanyOptions([]);
    setCompanyLoading(false);
    setCompanySearchVersion((current) => current + 1);
    setError("");
  };

  const selectType = (entityType) => {
    setForm((current) => ({
      ...EMPTY_FORM,
      entity_type: entityType,
      country_iso: current.country_iso,
      accounting_program: current.accounting_program,
      uses_inventory: current.uses_inventory,
    }));
    setEditingId(null);
    setCompanyInput("");
    setCompanyOptions([]);
    setCompanyLoading(false);
    setCompanySearchVersion((current) => current + 1);
    setError("");
  };

  const validate = () => {
    if (!normalize(form.name)) return "Įveskite profilio pavadinimą.";

    if (isCompany && !normalize(form.company_code)) {
      return "Įmonės kodas yra privalomas.";
    }

    if (!isCompany && !normalize(form.owner_name)) {
      return "Įveskite veiklos vykdytojo vardą ir pavardę.";
    }

    const duplicate = drafts.some((draft) => {
      if (draft._localId === editingId || draft.entity_type !== form.entity_type) {
        return false;
      }

      if (isCompany) {
        const codeMatch =
          normalize(form.company_code) &&
          normalize(draft.company_code) === normalize(form.company_code);
        const vatMatch =
          normalize(form.vat_code) &&
          normalize(draft.vat_code) === normalize(form.vat_code);
        const nameMatch =
          normalize(form.name) &&
          normalize(draft.name) === normalize(form.name);
        return Boolean(codeMatch || vatMatch || nameMatch);
      }

      return (
        normalize(draft.name) === normalize(form.name) &&
        normalize(draft.owner_name) === normalize(form.owner_name)
      );
    });

    if (duplicate) {
      return isCompany
        ? "Įmonė su tokiu kodu jau įtraukta."
        : "Tokia individuali veikla jau įtraukta.";
    }

    return "";
  };

  const handleAddOrUpdate = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const nextDraft = { ...form };

    if (isEditing) {
      setDrafts((current) =>
        current.map((draft) =>
          draft._localId === editingId
            ? { ...nextDraft, _localId: editingId }
            : draft
        )
      );
    } else {
      localId += 1;
      setDrafts((current) => [
        ...current,
        { ...nextDraft, _localId: localId },
      ]);
    }

    resetForm();
  };

  const handleEdit = (draft) => {
    setForm({ ...EMPTY_FORM, ...draft });
    setEditingId(draft._localId);
    setCompanyInput("");
    setCompanyOptions([]);
    setCompanyLoading(false);
    setCompanySearchVersion((current) => current + 1);
    setError("");

    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleDelete = (draftId) => {
    setDrafts((current) =>
      current.filter((draft) => draft._localId !== draftId)
    );

    if (editingId === draftId) {
      resetForm();
    }
  };

  const buildPayload = (draft) => {
    const basePayload = {
      entity_type: draft.entity_type,
      name: String(draft.name || "").trim(),
      country_iso: draft.country_iso,
      accounting_program: draft.accounting_program,
      uses_inventory: !!draft.uses_inventory,
    };

    if (draft.entity_type === "imone") {
      return {
        ...basePayload,
        company_code: String(draft.company_code || "").trim(),
        vat_code: String(draft.vat_code || "").trim(),
        address: draft.address || "",
      };
    }

    return {
      ...basePayload,
      owner_name: String(draft.owner_name || "").trim(),
      iv_certificate_nr: String(draft.iv_certificate_nr || "").trim(),
    };
  };

  const extractError = (requestError) => {
    const responseData = requestError?.response?.data;

    if (responseData && typeof responseData === "object") {
      return Object.values(responseData).flat().join(" ");
    }

    return "Nepavyko sukurti profilio.";
  };

  const handleCreateAll = async () => {
    if (drafts.length === 0 || hasUnsavedInput || creating) return;

    setError("");
    setCreating(true);
    setCreationTotal(drafts.length);
    setCreatedCount(0);

    const remainingDrafts = [...drafts];

    try {
      while (remainingDrafts.length > 0) {
        const currentDraft = remainingDrafts[0];
        await api.post(CREATE_ENDPOINT, buildPayload(currentDraft));
        remainingDrafts.shift();
        setCreatedCount((count) => count + 1);
        setDrafts([...remainingDrafts]);
      }

      await refresh();
      navigate("/suvestine", { replace: true });
    } catch (requestError) {
      setDrafts([...remainingDrafts]);
      setError(
        `Nepavyko sukurti „${remainingDrafts[0]?.name || "profilio"}": ${extractError(
          requestError
        )}`
      );
    } finally {
      setCreating(false);
    }
  };

  const countrySelect = (
    <TextField
      select
      fullWidth
      required
      label="Šalis"
      value={form.country_iso}
      onChange={setField("country_iso")}
      SelectProps={{ MenuProps: { disableScrollLock: true } }}
    >
      {COUNTRY_OPTIONS.map((country) => (
        <MenuItem key={country.code} value={country.code}>
          {country.name}
        </MenuItem>
      ))}
    </TextField>
  );

  const finalButtonLabel = creating
    ? `Kuriami profiliai (${createdCount}/${creationTotal})`
    : drafts.length === 1
    ? "Sukurti profilį ir pradėti"
    : `Sukurti (${drafts.length}) profilius ir pradėti`;

  const finalButtonDisabled =
    drafts.length === 0 || creating || hasUnsavedInput;

  const finalButtonActive = !finalButtonDisabled;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#f8f8f8",
        px: { xs: 2, md: 3 },
        py: { xs: 3, md: 5 },
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 1120, mx: "auto" }}>
        <Box sx={{ maxWidth: 760, mb: { xs: 3, md: 4 } }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 28, md: 36 },
              lineHeight: 1.15,
              fontWeight: 750,
              letterSpacing: "-0.03em",
              color: "text.primary",
            }}
          >
            Kurių įmonių apskaitą vedate?
          </Typography>

          <Typography
            color="text.secondary"
            sx={{ mt: 1.25, fontSize: { xs: 15, md: 16 }, lineHeight: 1.65 }}
          >
            Sukurkite profilius visoms įmonėms bei individualioms veikloms,
            kurių apskaitą vedate. Naujus profilius galėsite pridėti ir vėliau.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.45fr) minmax(330px, 0.8fr)" },
            gap: { xs: 2, md: 3 },
            alignItems: "start",
          }}
        >
          <Paper
            ref={formCardRef}
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 4,
              overflow: "hidden",
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" fontWeight={700}>
                  {isEditing ? "Redaguokite profilį" : "Įveskite profilio duomenis"}
                </Typography>
              </Box>

              {error && (
                <Alert severity="error" onClose={() => setError("")} sx={{ mb: 2.5 }}>
                  {error}
                </Alert>
              )}

              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Profilio tipas
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 0.75,
                  mt: 1,
                  mb: 3,
                  p: 0.75,
                  borderRadius: 3,
                  bgcolor: "grey.100",
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                {TYPE_OPTIONS.map((option) => {
                  const active = form.entity_type === option.value;
                  const TypeIcon = option.icon;

                  return (
                    <Box
                      key={option.value}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectType(option.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectType(option.value);
                        }
                      }}
                      sx={(theme) => ({
                        position: "relative",
                        display: "flex",
                        gap: 1.15,
                        alignItems: "center",
                        minHeight: 72,
                        p: 1.5,
                        borderRadius: 2.5,
                        border: "1px solid",
                        borderColor: active ? "primary.main" : "transparent",
                        bgcolor: active ? "primary.main" : "background.paper",
                        color: active ? "primary.contrastText" : "text.primary",
                        cursor: "pointer",
                        boxShadow: active ? theme.shadows[2] : "none",
                        transition:
                          "background-color .15s ease, border-color .15s ease, box-shadow .15s ease",
                        outline: "none",
                        "&:hover": {
                          bgcolor: active ? "primary.dark" : "grey.50",
                        },
                        "&:focus-visible": {
                          boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`,
                        },
                      })}
                    >
                      <Box
                        sx={(theme) => ({
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          display: "grid",
                          placeItems: "center",
                          bgcolor: active
                            ? alpha(theme.palette.common.white, 0.16)
                            : "grey.100",
                          color: active ? "inherit" : "text.secondary",
                          flexShrink: 0,
                        })}
                      >
                        <TypeIcon />
                      </Box>

                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={650}>
                          {option.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: active ? "inherit" : "text.secondary", opacity: active ? 0.8 : 1 }}
                        >
                          {option.description}
                        </Typography>
                      </Box>

                      {active && (
                        <CheckCircleRoundedIcon
                          sx={{
                            position: "absolute",
                            top: 9,
                            right: 9,
                            fontSize: 18,
                            color: "inherit",
                            opacity: 0.9,
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>

              <Stack spacing={2.25}>
                {isCompany ? (
                  <>
                    <Autocomplete
                      key={companySearchVersion}
                      options={companyOptions}
                      loading={companyLoading}
                      loadingText="Kraunama..."
                      noOptionsText={
                        companyInput.trim().length < 2
                          ? "Įveskite bent 2 simbolius"
                          : "Įmonių nerasta"
                      }
                      inputValue={companyInput}
                      filterOptions={(options) => options}
                      clearOnBlur={false}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      getOptionLabel={(option) =>
                        typeof option === "string" ? option : option.pavadinimas || ""
                      }
                      onInputChange={(_, value) => {
                        setCompanyInput(value);
                        setError("");
                      }}
                      onChange={(_, value) => {
                        if (value && typeof value === "object") {
                          setForm((current) => ({
                            ...current,
                            name: value.pavadinimas || "",
                            company_code: value.im_kodas || "",
                            vat_code: value.pvm_kodas || "",
                            address: value.adresas || "",
                          }));
                        }
                      }}
                      renderOption={(props, option) => (
                        <li {...props} key={option.id}>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <Box
                              sx={{
                                width: 34,
                                height: 34,
                                borderRadius: 1.75,
                                bgcolor: "grey.100",
                                color: "text.secondary",
                                display: "grid",
                                placeItems: "center",
                              }}
                            >
                              <ApartmentRoundedIcon fontSize="small" />
                            </Box>
                            <Box>
                              <Typography variant="body2" fontWeight={700}>
                                {option.pavadinimas}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {option.im_kodas}
                                {option.pvm_kodas ? ` · ${option.pvm_kodas}` : ""}
                              </Typography>
                            </Box>
                          </Stack>
                        </li>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Ieškoti įmonės"
                          placeholder="Įveskite įmonės pavadinimą arba kodą"
                          helperText="Pasirinkus įmonę, jos duomenys užsipildys automatiškai."
                          InputProps={{
                            ...params.InputProps,
                            startAdornment: (
                              <>
                                <SearchRoundedIcon
                                  fontSize="small"
                                  sx={{ ml: 0.5, mr: 0.75, color: "text.disabled" }}
                                />
                                {params.InputProps.startAdornment}
                              </>
                            ),
                            endAdornment: (
                              <>
                                {companyLoading ? <CircularProgress size={18} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                    />

                    <Divider>
                      <Typography variant="caption" color="text.secondary">
                        arba įveskite ranka
                      </Typography>
                    </Divider>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "1.35fr 0.65fr" },
                        gap: 2,
                      }}
                    >
                      <TextField
                        fullWidth
                        required
                        label="Įmonės pavadinimas"
                        value={form.name}
                        onChange={setField("name")}
                      />
                      <TextField
                        fullWidth
                        required
                        label="Įmonės kodas"
                        value={form.company_code}
                        onChange={setField("company_code")}
                      />
                    </Box>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                        gap: 2,
                      }}
                    >
                      <TextField
                        fullWidth
                        label="PVM mokėtojo kodas"
                        value={form.vat_code}
                        onChange={setField("vat_code")}
                      />
                      {countrySelect}
                    </Box>
                  </>
                ) : (
                  <>
                    <TextField
                      fullWidth
                      required
                      label="Profilio pavadinimas"
                      placeholder="Pvz., Jonas Jonaitis IV"
                      value={form.name}
                      onChange={setField("name")}
                    />

                    <TextField
                      fullWidth
                      required
                      label="Vardas ir pavardė"
                      value={form.owner_name}
                      onChange={setField("owner_name")}
                    />

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                        gap: 2,
                      }}
                    >
                      <TextField
                        fullWidth
                        label="IV pažymos numeris"
                        value={form.iv_certificate_nr}
                        onChange={setField("iv_certificate_nr")}
                      />
                      {countrySelect}
                    </Box>
                  </>
                )}

                <TextField
                  select
                  fullWidth
                  required
                  label="Naudojama apskaitos programa"
                  value={form.accounting_program}
                  onChange={setField("accounting_program")}
                  helperText="Pagal pasirinktą programą pritaikysime dokumentų eksporto formatą"
                  SelectProps={{ MenuProps: { disableScrollLock: true } }}
                >
                  {ACCOUNTING_PROGRAMS.map((program) => (
                    <MenuItem key={program.value} value={program.value}>
                      {program.label}
                    </MenuItem>
                  ))}
                </TextField>

                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 2.5,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "grey.50",
                  }}
                >
                  <FormControlLabel
                    sx={{ m: 0, alignItems: "flex-start", gap: 1 }}
                    control={
                      <Switch
                        checked={!!form.uses_inventory}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            uses_inventory: e.target.checked,
                          }))
                        }
                      />
                    }
                    label={
                      <Box sx={{ mt: 0.25 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="body2" fontWeight={650}>
                            Vedama sandėlio apskaita
                          </Typography>
                          <Tooltip
                            title="Nevedant sandėlio apskaitos perkamos prekės keliaus tiesiai į sąnaudas"
                            arrow
                            placement="top"
                          >
                            <HelpOutlineIcon
                              sx={{ fontSize: 16, color: "text.disabled", cursor: "help" }}
                            />
                          </Tooltip>
                        </Box>
                      </Box>
                    }
                  />
                </Box>
              </Stack>
            </Box>

            <Divider />

            <Box sx={{ p: { xs: 2.5, sm: 3 }, bgcolor: "grey.50" }}>
              <Stack
                direction="row"
                justifyContent="flex-end"
                alignItems="center"
                spacing={1}
              >
                {(isEditing || hasUnsavedInput) && (
                  <Button
                    color="inherit"
                    onClick={() => resetForm()}
                    disabled={creating}
                    sx={{ borderRadius: 2.25, fontWeight: 500 }}
                  >
                    {isEditing ? "Atšaukti" : "Išvalyti"}
                  </Button>
                )}

                <Button
                  variant="contained"
                  startIcon={isEditing ? <CheckCircleRoundedIcon /> : <AddRoundedIcon />}
                  onClick={handleAddOrUpdate}
                  disabled={creating}
                  sx={(theme) => ({
                    minHeight: 44,
                    borderRadius: 2.25,
                    px: 2.5,
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                    boxShadow: theme.shadows[3],
                    "&:hover": {
                      boxShadow: theme.shadows[5],
                    },
                  })}
                >
                  {isEditing ? "Išsaugoti pakeitimus" : "Įtraukti profilį"}
                </Button>
              </Stack>
            </Box>
          </Paper>

          <Box sx={{ position: { md: "sticky" }, top: { md: 24 } }}>
            <Paper
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 4,
                overflow: "hidden",
                bgcolor: "background.paper",
              }}
            >
              <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  spacing={2}
                  sx={{ mb: 2.5 }}
                >
                  <Box>
                    <Typography variant="h6" fontWeight={700}>
                      Jūsų profilių sąrašas
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      minWidth: 32,
                      height: 28,
                      px: 1,
                      borderRadius: 99,
                      background: finalButtonActive
                        ? "linear-gradient(135deg, #34D399 0%, #10B981 100%)"
                        : "#E5E7EB",
                      color: finalButtonActive ? "#FFFFFF" : "#6B7280",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 13,
                      fontWeight: 750,
                      boxShadow: finalButtonActive
                        ? "0 5px 14px rgba(16, 185, 129, 0.28)"
                        : "none",
                      transition:
                        "background .18s ease, color .18s ease, box-shadow .18s ease",
                    }}
                  >
                    {drafts.length}
                  </Box>
                </Stack>

                {drafts.length === 0 ? (
                  <Box
                    sx={{
                      border: "1px dashed",
                      borderColor: "divider",
                      borderRadius: 3,
                      p: 3,
                      textAlign: "center",
                      bgcolor: "grey.50",
                    }}
                  >
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2.5,
                        bgcolor: "background.paper",
                        border: "1px solid",
                        borderColor: "divider",
                        color: "text.disabled",
                        display: "grid",
                        placeItems: "center",
                        mx: "auto",
                        mb: 1.5,
                      }}
                    >
                      <BusinessRoundedIcon />
                    </Box>
                    <Typography variant="body2" fontWeight={700}>
                      Profiliai dar neįtraukti
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      Užpildykite formą ir spauskite „Įtraukti profilį“.
                    </Typography>
                  </Box>
                ) : (
                  <Stack spacing={1.25}>
                    {drafts.map((draft) => {
                      const isCurrent = editingId === draft._localId;

                      return (
                        <Box
                          key={draft._localId}
                          sx={(theme) => ({
                            display: "flex",
                            alignItems: "center",
                            gap: 1.25,
                            p: 1.5,
                            borderRadius: 2.75,
                            border: "1px solid",
                            borderColor: isCurrent ? "primary.main" : "divider",
                            bgcolor: isCurrent
                              ? alpha(theme.palette.primary.main, 0.045)
                              : "background.paper",
                          })}
                        >
                          <Box
                            sx={(theme) => ({
                              width: 40,
                              height: 40,
                              borderRadius: 2,
                              flexShrink: 0,
                              display: "grid",
                              placeItems: "center",
                              bgcolor:
                                draft.entity_type === "imone"
                                  ? alpha(theme.palette.primary.main, 0.1)
                                  : alpha(theme.palette.secondary.main, 0.1),
                              color:
                                draft.entity_type === "imone"
                                  ? "primary.main"
                                  : "secondary.main",
                            })}
                          >
                            {draft.entity_type === "imone" ? (
                              <BusinessRoundedIcon fontSize="small" />
                            ) : (
                              <PersonRoundedIcon fontSize="small" />
                            )}
                          </Box>

                          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                            <Typography variant="body2" fontWeight={800} noWrap>
                              {draft.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              noWrap
                              sx={{ display: "block", mt: 0.2 }}
                            >
                              {profileTypeLabel(draft.entity_type)}
                              {draft.entity_type === "imone" && draft.company_code
                                ? ` · ${draft.company_code}`
                                : ""}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              noWrap
                              sx={{ display: "block" }}
                            >
                              {programLabel(draft.accounting_program)}
                            </Typography>
                          </Box>

                          <Stack direction="row" spacing={0.25}>
                            <IconButton
                              size="small"
                              aria-label={`Redaguoti ${draft.name}`}
                              onClick={() => handleEdit(draft)}
                              disabled={creating}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              aria-label={`Pašalinti ${draft.name}`}
                              onClick={() => handleDelete(draft._localId)}
                              disabled={creating}
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>

              <Divider />

              <Box sx={{ p: { xs: 2.5, sm: 3 }, bgcolor: "grey.50" }}>
                <Typography
                  variant="body2"
                  color={hasUnsavedInput ? "warning.main" : "text.secondary"}
                  sx={{ mb: 1.75, lineHeight: 1.5 }}
                >
                  {hasUnsavedInput
                    ? (isEditing
                        ? "Išsaugokite profilio pakeitimus arba atšaukite redagavimą"
                        : "Įtraukite pradėtą pildyti profilį arba išvalykite formą")
                    : drafts.length === 0
                    ? "Įtraukite bent vieną profilį, kad galėtumėte tęsti"
                    : "Profiliai bus sukurti paspaudus mygtuką žemiau"}
                </Typography>

                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  endIcon={
                    creating ? (
                      <CircularProgress size={19} color="inherit" />
                    ) : (
                      <ArrowForwardRoundedIcon />
                    )
                  }
                  disabled={finalButtonDisabled}
                  onClick={handleCreateAll}
                  sx={{
                    minHeight: 50,
                    borderRadius: 2.5,
                    fontWeight: 650,
                    color: finalButtonActive ? "#FFFFFF" : undefined,

                    background: finalButtonActive
                      ? "linear-gradient(135deg, #16a16e 0%, #10B981 100%)"
                      : undefined,

                    boxShadow: finalButtonActive
                      ? "0 10px 24px rgba(16, 185, 129, 0.28)"
                      : "none",

                    transition:
                      "background .18s ease, box-shadow .18s ease, transform .18s ease",

                    "&:hover": finalButtonActive
                      ? {
                          background:
                            "linear-gradient(135deg, #12885E 0%, #0D966A 100%)",
                          boxShadow: "0 12px 28px rgba(16, 185, 129, 0.34)",
                          transform: "translateY(-1px)",
                        }
                      : undefined,

                    "&:active": finalButtonActive
                      ? {
                          transform: "translateY(0)",
                          boxShadow: "0 6px 16px rgba(16, 185, 129, 0.25)",
                        }
                      : undefined,

                    "&.Mui-disabled": {
                      background: "#E5E7EB",
                      color: "#9CA3AF",
                      boxShadow: "none",
                    },
                  }}
                >
                  {finalButtonLabel}
                </Button>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}