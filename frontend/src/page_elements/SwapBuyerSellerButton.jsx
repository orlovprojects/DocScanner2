import { useState } from 'react';
import { SwapHoriz } from '@mui/icons-material';
import { 
  IconButton, 
  Tooltip, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogContentText, 
  DialogActions,
  Button,
  CircularProgress,
} from '@mui/material';
import { api } from "../api/endpoints";

const SwapBuyerSellerButton = ({ 
  documentId, 
  isSuperuser, 
  sellerName,
  buyerName,
  onSwapComplete,
}) => {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Не показываем если не superuser
  if (!isSuperuser) {
    return null;
  }

  const handleSwap = async () => {
    setLoading(true);
    setConfirmOpen(false);

    try {
      const response = await api.post(
        `/documents/${documentId}/swap-buyer-seller/`,
        {},
        { withCredentials: true }
      );
      
      if (onSwapComplete) {
        onSwapComplete(response.data);
      }
    } catch (error) {
      console.error('Swap error:', error);
      alert(error.response?.data?.error || 'Klaida keičiant duomenis');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip title="Sukeisti pirkėją ir pardavėją">
        <IconButton 
          onClick={() => setConfirmOpen(true)} 
          disabled={loading}
          size="small"
          color="warning"
        >
          {loading ? <CircularProgress size={18} /> : <SwapHoriz />}
        </IconButton>
      </Tooltip>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Sukeisti duomenis?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{sellerName || '—'}</strong> ↔ <strong>{buyerName || '—'}</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Atšaukti</Button>
          <Button onClick={handleSwap} color="warning" variant="contained">
            Sukeisti
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SwapBuyerSellerButton;