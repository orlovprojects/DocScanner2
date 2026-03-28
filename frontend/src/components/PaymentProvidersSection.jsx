import { useState, useCallback } from 'react';
import {
  Box, Paper, TextField, Button, Typography, Grid2,
  CircularProgress, Chip, Alert,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import AddCardIcon from '@mui/icons-material/AddCard';
import { invoicingApi } from '../api/invoicingApi';
import LockIcon from '@mui/icons-material/Lock';


const P = { primary: '#333', bg: '#fafafa', border: '#e0e0e0' };
const secSx = {
  p: 2.5,
  backgroundColor: P.bg,
  borderRadius: 3,
  border: `1px solid ${P.border}`,
  mb: 3,
};
const titleSx = { fontSize: 18, fontWeight: 700, mb: 1.5 };

const PROVIDERS = [
  {
    name: 'montonio',
    displayName: 'Montonio',
    description:
      'Klientai galės apmokėti per Lietuvos ir kitų šalių bankus, kortele, Apple\u00a0Pay, Google\u00a0Pay.',
    helpUrl: 'https://help.montonio.com/en/articles/27851-how-to-find-api-keys-for-sandbox-payments',
    fields: [
      { key: 'access_key', label: 'Access Key', type: 'text', placeholder: 'pvz. c619b5fd-9f05-4df5-...' },
      { key: 'secret_key', label: 'Secret Key', type: 'password', placeholder: '' },
    ],
  },
  {
    name: 'paysera',
    displayName: 'Paysera',
    description:
      'Klientai galės apmokėti per Paysera sistemą, bankų nuorodas ir korteles.',
    helpUrl: 'https://support.paysera.com/en-us/13-12-payment-collection-projects/162-12-11-test-payments',
    fields: [
      { key: 'project_id', label: 'Projekto ID', type: 'text', placeholder: 'pvz. 123456' },
      { key: 'sign_password', label: 'Parašo slaptažodis', type: 'password', placeholder: '' },
    ],
  },
];

const SECRET_MASK = '••••••••';

const hasStoredKeys = (provDef, config) =>
  provDef.fields.some((f) => !!config[f.key]);

const getDisplayValue = (field, rawVal) => {
  if (!rawVal) return '';
  if (field.type === 'password') return SECRET_MASK;
  return rawVal;
};

const PaymentProvidersSection = ({ value = {}, onChange, showMsg, locked = false }) => {
  const [connecting, setConnecting] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [statuses, setStatuses] = useState({});   // runtime: 'connected' | 'error'
  const [errors, setErrors] = useState({});
  const [editedFields, setEditedFields] = useState({});

  const providers = value || {};

  const update = useCallback((providerName, field, fieldValue) => {
    setStatuses((prev) => ({ ...prev, [providerName]: undefined }));
    setErrors((prev) => ({ ...prev, [providerName]: undefined }));
    setEditedFields((prev) => ({ ...prev, [`${providerName}.${field}`]: true }));
    onChange?.({
      ...providers,
      [providerName]: {
        ...(providers[providerName] || {}),
        [field]: fieldValue,
      },
    });
  }, [providers, onChange]);

  const hasRequiredFields = (provDef) => {
    const config = providers[provDef.name] || {};
    return provDef.fields.every((f) => {
      const v = config[f.key];
      if (!v) return false;
      if (f.type === 'password' && !editedFields[`${provDef.name}.${f.key}`]) return true;
      return v !== SECRET_MASK;
    });
  };

  const handleConnect = useCallback(async (providerName) => {
    setConnecting(providerName);
    setErrors((prev) => ({ ...prev, [providerName]: undefined }));
    setStatuses((prev) => ({ ...prev, [providerName]: undefined }));

    try {
      const config = providers[providerName] || {};
      const { data } = await invoicingApi.connectPaymentProvider({
        provider: providerName,
        ...config,
      });

      if (data?.connected) {
        setStatuses((prev) => ({ ...prev, [providerName]: 'connected' }));
        const updatedConfig = { ...(providers[providerName] || {}) };
        if (data.available_methods) {
          updatedConfig.available_methods = data.available_methods;
        }
        // Save last_test_result locally too
        updatedConfig.last_test_result = { connected: true };
        onChange?.({ ...providers, [providerName]: updatedConfig });

        if (data.available_methods?.length) {
          const displayName = PROVIDERS.find((p) => p.name === providerName)?.displayName || providerName;
          showMsg?.(
            `${displayName} prijungta! Galimi ${data.available_methods.length} mokėjimo būdai.`,
            'success',
          );
        } else {
          const displayName = PROVIDERS.find((p) => p.name === providerName)?.displayName || providerName;
          showMsg?.(`${displayName} sėkmingai prijungta!`, 'success');
        }
      } else {
        setStatuses((prev) => ({ ...prev, [providerName]: 'error' }));
        const errMsg = data?.error || 'Nepavyko prisijungti – patikrinkite raktus';
        setErrors((prev) => ({ ...prev, [providerName]: errMsg }));
        showMsg?.(errMsg, 'error');
      }
    } catch (e) {
      setStatuses((prev) => ({ ...prev, [providerName]: 'error' }));
      const errMsg = e.response?.data?.detail || 'Nepavyko prisijungti';
      setErrors((prev) => ({ ...prev, [providerName]: errMsg }));
      showMsg?.(errMsg, 'error');
    } finally {
      setConnecting(null);
    }
  }, [providers, onChange, showMsg]);

  const handleDeleteKeys = useCallback(async (providerName) => {
    setDeleting(providerName);
    try {
      await invoicingApi.disconnectPaymentProvider({ provider: providerName });
      setStatuses((prev) => ({ ...prev, [providerName]: undefined }));
      setErrors((prev) => ({ ...prev, [providerName]: undefined }));
      onChange?.({ ...providers, [providerName]: {} });
      setEditedFields((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.startsWith(`${providerName}.`)) delete next[k];
        });
        return next;
      });
      showMsg?.('Raktai ištrinti');
    } catch (e) {
      showMsg?.(e.response?.data?.detail || 'Klaida trinant raktus', 'error');
    } finally {
      setDeleting(null);
    }
  }, [providers, onChange, showMsg]);

  return (
    <Box sx={secSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <AddCardIcon sx={{ color: P.primary, fontSize: 24 }} />
        <Typography sx={{ ...titleSx, color: P.primary, mb: 0 }}>
          Tiesioginio apmokėjimo nuorodos sąskaitose
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Prijunkite mokėjimo teikėją, kad sąskaitos turėtų tiesioginę apmokėjimo
        nuorodą. Klientai galės apmokėti vienu paspaudimu, o sąskaita automatiškai
        pasižymės kaip apmokėta.
      </Typography>

      {locked && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2.5,
            py: { xs: 1.5, md: 1.75 },
            mb: 2.5,
            borderRadius: 3,
            bgcolor: "rgba(255, 145, 0, 0.10)",
            border: "1px solid rgba(255, 145, 0, 0.28)",
            boxShadow: "0 10px 30px rgba(255, 145, 0, 0.10)",
            backdropFilter: "blur(8px)",
            flexWrap: "wrap",
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "rgba(255, 145, 0, 0.14)",
              flexShrink: 0,
            }}
          >
            <LockIcon sx={{ color: "#F57C00", fontSize: 18 }} />
          </Box>
          <Typography
            variant="body2"
            sx={{ color: "#3B2A1A", fontWeight: 500, lineHeight: 1.5, flex: 1, minWidth: 200 }}
          >
            Apmokėjimo nuorodos prieinamos tik su mokamu planu arba bandomuoju laikotarpiu.
          </Typography>
          <Button
            size="small"
            href="/papildyti#planai"
            sx={{
              textTransform: "none",
              borderRadius: 2.5,
              px: 2,
              py: 0.75,
              minWidth: "fit-content",
              flexShrink: 0,
              fontWeight: 600,
              color: "#fff",
              background: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)",
              boxShadow: "none",
              "&:hover": {
                background: "linear-gradient(135deg, #FB8C00 0%, #EF6C00 100%)",
                boxShadow: "none",
              },
            }}
          >
            Įsigyti planą
          </Button>
        </Box>
      )}

      {PROVIDERS.map((pd) => {
        const config = providers[pd.name] || {};
        const status = statuses[pd.name];
        const error = errors[pd.name];
        const isConnecting = connecting === pd.name;
        const isDeleting = deleting === pd.name;
        const keysStored = hasStoredKeys(pd, config);
        const availableMethods = config.available_methods || [];

        // Connected = runtime 'connected' OR loaded from DB with successful last test
        const dbConnected = config.last_test_result?.connected === true;
        const isConnected =
          status === 'connected' || (keysStored && dbConnected && status !== 'error');

        // Last error from DB (if any)
        const dbError = config.last_test_result?.error;

        return (
          <Paper
            key={pd.name}
            variant="outlined"
            sx={{ p: 2, mb: 2, borderRadius: 2 }}
          >
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              <Typography fontWeight={600}>{pd.displayName}</Typography>

              {isConnected && (
                <Chip
                  icon={<CheckIcon sx={{ fontSize: 14 }} />}
                  label="Prijungta"
                  size="small"
                  color="success"
                  sx={{ fontSize: 11, height: 22 }}
                />
              )}

              {(status === 'error' || (keysStored && !dbConnected && !isConnected)) && (
                <Chip
                  icon={<ErrorIcon sx={{ fontSize: 14 }} />}
                  label="Klaida"
                  size="small"
                  color="error"
                  sx={{ fontSize: 11, height: 22 }}
                />
              )}
            </Box>

            {/* Description */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {pd.description}
            </Typography>

            {/* Available methods */}
            {isConnected && availableMethods.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Galimi mokėjimo būdai ({availableMethods.length}):
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {availableMethods.map((m) => (
                    <Chip
                      key={m.bic || m.name}
                      label={m.name}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: 11, height: 22 }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* DB error from last test (shown on page load if last test failed) */}
            {!error && dbError && keysStored && !isConnected && (
              <Alert severity="error" sx={{ mb: 1.5, fontSize: 13 }}>
                Paskutinis bandymas: {dbError}
              </Alert>
            )}

            {/* Fields */}
            <Grid2 container spacing={1.5} sx={{ mb: 1.5 }}>
              {pd.fields.map((f) => {
                const rawVal = config[f.key] || '';
                const isEdited = !!editedFields[`${pd.name}.${f.key}`];
                const displayVal = isEdited ? rawVal : getDisplayValue(f, rawVal);

                return (
                  <Grid2 key={f.key} size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label={f.label}
                      type={f.type === 'password' ? 'password' : 'text'}
                      placeholder={f.placeholder}
                      value={displayVal}
                      disabled={locked}
                      onFocus={() => {
                        if (!locked && displayVal === SECRET_MASK) {
                          update(pd.name, f.key, '');
                        }
                      }}
                      onChange={(e) => { if (!locked) update(pd.name, f.key, e.target.value); }}
                    />
                  </Grid2>
                );
              })}
            </Grid2>

            {/* Runtime error */}
            {error && (
              <Alert severity="error" sx={{ mb: 1.5, fontSize: 13 }}>
                {error}
              </Alert>
            )}

            {/* Buttons */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                size="small"
                onClick={() => handleConnect(pd.name)}
                disabled={isConnecting || !hasRequiredFields(pd) || locked}
                startIcon={
                  isConnecting ? <CircularProgress size={14} color="inherit" /> : null
                }
              >
                {isConnecting ? 'Jungiamasi...' : 'Prijungti'}
              </Button>

              {keysStored && (
                <Button
                  size="small"
                  color="error"
                  variant="text"
                  onClick={() => handleDeleteKeys(pd.name)}
                  disabled={isDeleting}
                  startIcon={
                    isDeleting
                      ? <CircularProgress size={14} />
                      : <DeleteIcon sx={{ fontSize: 16 }} />
                  }
                  sx={{ textTransform: 'none', fontSize: 13 }}
                >
                  Ištrinti raktus
                </Button>
              )}

              {pd.helpUrl && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="a"
                  href={pd.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Kur rasti raktus?
                </Typography>
              )}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
};

export default PaymentProvidersSection;