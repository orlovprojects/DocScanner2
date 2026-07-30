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
  Stack,
  Divider,
  Autocomplete,
  MenuItem,
  CircularProgress,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import { api } from "../api/endpoints";
import { COUNTRY_OPTIONS } from "../page_elements/Countries";

const SEARCH_ENDPOINT = "company-profiles/search/";

const EMPTY = {
  company_name: "",
  company_code: "",
  vat_code: "",
  company_iban: "",
  company_address: "",
  company_country_iso: "LT",
};

const normalize = (v) => String(v || "").trim();

export default function EditBillingRequisitesDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [companySearchVersion, setCompanySearchVersion] = useState(0);

  // загрузка текущих реквизитов при открытии
  useEffect(() => {
    if (!open) return;
    setError("");
    setTouched(false);
    setCompanyInput("");
    setCompanyOptions([]);
    setCompanySearchVersion((v) => v + 1);

    setLoading(true);
    api
      .get("/profile/", { withCredentials: true })
      .then(({ data }) => {
        setForm({
          company_name: data.company_name || "",
          company_code: data.company_code || "",
          vat_code: data.vat_code || "",
          company_iban: data.company_iban || "",
          company_address: data.company_address || "",
          company_country_iso: data.company_country_iso || "LT",
        });
      })
      .catch(() => setError("Nepavyko užkrauti rekvizitų."))
      .finally(() => setLoading(false));
  }, [open]);

  // поиск фирмы (debounce)
  useEffect(() => {
    if (!open) return undefined;
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
  }, [companyInput, open]);

  const setField = (name) => (e) => {
    setError("");
    setForm((cur) => ({ ...cur, [name]: e.target.value }));
  };

  const handleSave = async () => {
    setTouched(true);
    if (!normalize(form.company_name) || !normalize(form.company_code) || !form.company_country_iso) {
      setError("Įmonės pavadinimas, Įmonės kodas ir Įmonės šalis yra privalomi.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.patch(
        "/profile/",
        {
          company_name: form.company_name,
          company_code: form.company_code,
          vat_code: form.vat_code,
          company_iban: form.company_iban,
          company_address: form.company_address,
          company_country_iso: form.company_country_iso,
        },
        { withCredentials: true }
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || "Nepavyko išsaugoti rekvizitų.");
    } finally {
      setSaving(false);
    }
  };

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
          Keisti įmonės rekvizitus
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: "#6B7280" }}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: "8px !important", minHeight: 500 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
          Šie rekvizitai naudojami sąskaitose už DokSkeno paslaugas
        </Typography>

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
            <CircularProgress size={26} />
          </Box>
        ) : (
          <Stack spacing={2.25}>
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
                  setForm((cur) => ({
                    ...cur,
                    company_name: value.pavadinimas || "",
                    company_code: value.im_kodas || "",
                    vat_code: value.pvm_kodas || "",
                    company_address: value.adresas || "",
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
                arba redaguokite ranka
              </Typography>
            </Divider>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1.35fr 0.65fr" }, gap: 2 }}>
              <TextField
                fullWidth
                required
                size="small"
                label="Įmonės pavadinimas"
                value={form.company_name}
                onChange={setField("company_name")}
                error={touched && !normalize(form.company_name)}
                helperText={touched && !normalize(form.company_name) ? "Privalomas laukas" : ""}
              />
              <TextField
                fullWidth
                required
                size="small"
                label="Įmonės kodas"
                value={form.company_code}
                onChange={setField("company_code")}
                error={touched && !normalize(form.company_code)}
                helperText={touched && !normalize(form.company_code) ? "Privalomas laukas" : ""}
              />
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              <TextField
                fullWidth
                size="small"
                label="PVM kodas"
                value={form.vat_code}
                onChange={setField("vat_code")}
              />
              <Autocomplete
                disablePortal
                options={COUNTRY_OPTIONS}
                getOptionLabel={(option) => option.name}
                value={COUNTRY_OPTIONS.find((opt) => opt.code === form.company_country_iso) || null}
                onChange={(_, newValue) =>
                  setForm((cur) => ({ ...cur, company_country_iso: newValue ? newValue.code : "" }))
                }
                isOptionEqualToValue={(option, value) => option.code === value.code}
                slotProps={{ popper: { disableScrollLock: true } }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    label="Šalis"
                    required
                    error={touched && !form.company_country_iso}
                    helperText={touched && !form.company_country_iso ? "Privalomas laukas" : ""}
                  />
                )}
              />
            </Box>

            <TextField
              fullWidth
              size="small"
              label="Įmonės adresas"
              value={form.company_address}
              onChange={setField("company_address")}
            />

            <TextField
              fullWidth
              size="small"
              label="Įmonės IBAN"
              value={form.company_iban}
              onChange={setField("company_iban")}
              placeholder="LT..."
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", color: "#6B7280" }}>
          Atšaukti
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading}
          sx={{ textTransform: "none", fontWeight: 600, px: 3, borderRadius: "8px" }}
          startIcon={saving ? <CircularProgress size={16} /> : null}
        >
          {saving ? "Saugoma..." : "Išsaugoti"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}