/**
 * PaymentLinkToggle.jsx
 * =====================
 * Toggle + dropdown для InvoiceEditorPage.
 *
 * Использование:
 *   import PaymentLinkToggle from './PaymentLinkToggle';
 *   ...
 *   const [paymentLink, setPaymentLink] = useState({ enabled: false, provider: '' });
 *   ...
 *   <PaymentLinkToggle value={paymentLink} onChange={setPaymentLink} />
 *
 * При сохранении счёта:
 *   if (paymentLink.enabled && paymentLink.provider) {
 *     await api.post(`/invoicing/invoices/${invoice.id}/generate-payment-link/`, {
 *       provider: paymentLink.provider,
 *     }, { withCredentials: true });
 *   }
 */

import { useState, useEffect } from 'react';
import {
  Box, TextField, Switch, FormControlLabel, Chip, Typography,
} from '@mui/material';
import { Link as LinkIcon } from '@mui/icons-material';
import { api } from '../api/endpoints';

const PaymentLinkToggle = ({ value, onChange }) => {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/invoicing/payment-providers/', {
          withCredentials: true,
        });
        setProviders(data || []);
        // Если один провайдер — автовыбор
        if (data?.length === 1) {
          onChange({ enabled: true, provider: data[0].name });
        }
      } catch { /* нет настроенных провайдеров — скрываем */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Не показываем если нет настроенных провайдеров
  if (providers.length === 0) return null;

  const { enabled = false, provider = '' } = value || {};

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      p: 1.5, backgroundColor: '#fafafa', borderRadius: 2,
      border: '1px solid #e0e0e0',
    }}>
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(e) => onChange({
              enabled: e.target.checked,
              provider: e.target.checked
                ? (provider || providers[0]?.name || '')
                : provider,
            })}
          />
        }
        label={
          <Typography variant="body2" fontWeight={500}>
            Pridėti mokėjimo nuorodą
          </Typography>
        }
      />

      {enabled && providers.length > 1 && (
        <TextField
          select size="small" label="Mokėjimo teikėjas"
          value={provider}
          onChange={(e) => onChange({ enabled, provider: e.target.value })}
          SelectProps={{ native: true }}
          sx={{ minWidth: 180 }}
        >
          <option value="">Pasirinkite...</option>
          {providers.map((p) => (
            <option key={p.name} value={p.name}>{p.display_name}</option>
          ))}
        </TextField>
      )}

      {enabled && provider && (
        <Chip
          icon={<LinkIcon sx={{ fontSize: 16 }} />}
          label={`${providers.find((p) => p.name === provider)?.display_name || provider}`}
          color="info"
          variant="outlined"
          size="small"
        />
      )}
    </Box>
  );
};

export default PaymentLinkToggle;