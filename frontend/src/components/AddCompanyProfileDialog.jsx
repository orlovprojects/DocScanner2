import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  MenuItem,
  Stack,
  Divider,
  Autocomplete,
  CircularProgress,
  Alert,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { api } from "../api/endpoints";
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

const normalize = (value) => String(value || "").trim().toLowerCase();

export default function AddCompanyProfileDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [companySearchVersion, setCompanySearchVersion] = useState(0);

  const isCompany = form.entity_type === "imone";

  // сброс при закрытии
  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setError("");
      setSaving(false);
      setCompanyOptions([]);
      setCompanyLoading(false);
      setCompanyInput("");
    }
  }, [open]);

  // поиск фирмы (debounce, только для įmonė)
  useEffect(() => {
    if (!open || !isCompany) {
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
        const { data } = await api.get(SEARCH_ENDPOINT, { params: { q: query } });
        setCompanyOptions(data.results || []);
      } catch {
        setCompanyOptions([]);
      } finally {
        setCompanyLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [companyInput, isCompany, open]);

  const setField = (fieldName) => (event) => {
    setError("");
    setForm((current) => ({ ...current, [fieldName]: event.target.value }));
  };

  const selectType = (entityType) => {
    setForm((current) => ({
      ...EMPTY_FORM,
      entity_type: entityType,
      country_iso: current.country_iso,
      accounting_program: current.accounting_program,
    }));
    setCompanyInput("");
    setCompanyOptions([]);
    setCompanySearchVersion((v) => v + 1);
    setError("");
  };

  const validate = () => {
    if (!normalize(form.name)) return "Įveskite profilio pavadinimą.";
    if (isCompany && !normalize(form.company_code)) return "Įmonės kodas yra privalomas.";
    if (!isCompany && !normalize(form.owner_name)) return "Įveskite veiklos vykdytojo vardą ir pavardę.";
    if (!form.accounting_program) return "Pasirinkite apskaitos programą.";
    if (!form.country_iso) return "Pasirinkite šalį.";
    return "";
  };

  const canSave = () => !validate();

  const buildPayload = () => {
    const base = {
      entity_type: form.entity_type,
      name: String(form.name || "").trim(),
      country_iso: form.country_iso,
      accounting_program: form.accounting_program,
    };

    if (isCompany) {
      return {
        ...base,
        company_code: String(form.company_code || "").trim(),
        vat_code: String(form.vat_code || "").trim(),
        address: form.address || "",
      };
    }

    return {
      ...base,
      owner_name: String(form.owner_name || "").trim(),
      iv_certificate_nr: String(form.iv_certificate_nr || "").trim(),
    };
  };

  const extractError = (requestError) => {
    const responseData = requestError?.response?.data;
    if (responseData && typeof responseData === "object") {
      return Object.values(responseData).flat().join(" ");
    }
    return "Nepavyko sukurti profilio.";
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setSaving(true);
    try {
      const { data } = await api.post(CREATE_ENDPOINT, buildPayload());
      onCreated?.(data);
      onClose();
    } catch (err) {
      setError(extractError(err));
      setSaving(false);
    }
  };

  const countrySelect = (
    <TextField
      select
      fullWidth
      required
      size="small"
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      disableScrollLock
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px" } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
        }}
      >
        <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
          Naujas įmonės profilis
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: "#6B7280" }}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: "8px !important" }}>
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {/* ── Profilio tipas ── */}
        <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 1 }}>
          Profilio tipas
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 0.75,
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
                  minHeight: 66,
                  p: 1.5,
                  borderRadius: 2.5,
                  border: "1px solid",
                  borderColor: active ? "primary.main" : "transparent",
                  bgcolor: active ? "primary.main" : "background.paper",
                  color: active ? "primary.contrastText" : "text.primary",
                  cursor: "pointer",
                  boxShadow: active ? theme.shadows[2] : "none",
                  transition: "background-color .15s ease, border-color .15s ease, box-shadow .15s ease",
                  outline: "none",
                  "&:hover": { bgcolor: active ? "primary.dark" : "grey.50" },
                  "&:focus-visible": {
                    boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`,
                  },
                })}
              >
                <Box
                  sx={(theme) => ({
                    width: 38,
                    height: 38,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: active ? alpha(theme.palette.common.white, 0.16) : "grey.100",
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
                    sx={{ color: active ? "inherit" : "text.secondary", opacity: active ? 0.85 : 1 }}
                  >
                    {option.description}
                  </Typography>
                </Box>
                {active && (
                  <CheckCircleRoundedIcon
                    sx={{ position: "absolute", top: 8, right: 8, fontSize: 17, color: "inherit", opacity: 0.9 }}
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
                  companyInput.trim().length < 2 ? "Įveskite bent 2 simbolius" : "Įmonių nerasta"
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
                          width: 32,
                          height: 32,
                          borderRadius: 1.5,
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
                    size="small"
                    label="Ieškoti įmonės"
                    placeholder="Įveskite įmonės pavadinimą arba kodą"
                    helperText="Pasirinkus įmonę, jos duomenys užsipildys automatiškai."
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <SearchRoundedIcon fontSize="small" sx={{ ml: 0.5, mr: 0.75, color: "text.disabled" }} />
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

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1.35fr 0.65fr" }, gap: 2 }}>
                <TextField
                  fullWidth
                  required
                  size="small"
                  label="Įmonės pavadinimas"
                  value={form.name}
                  onChange={setField("name")}
                />
                <TextField
                  fullWidth
                  required
                  size="small"
                  label="Įmonės kodas"
                  value={form.company_code}
                  onChange={setField("company_code")}
                />
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                <TextField
                  fullWidth
                  size="small"
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
                size="small"
                label="Profilio pavadinimas"
                placeholder="Pvz., Jonas Jonaitis IV"
                value={form.name}
                onChange={setField("name")}
              />
              <TextField
                fullWidth
                required
                size="small"
                label="Vardas ir pavardė"
                value={form.owner_name}
                onChange={setField("owner_name")}
              />
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                <TextField
                  fullWidth
                  size="small"
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
            size="small"
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
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", color: "#6B7280" }}>
          Atšaukti
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!canSave() || saving}
          sx={{ textTransform: "none", fontWeight: 600, px: 3, borderRadius: "8px" }}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {saving ? "Kuriama..." : "Sukurti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}