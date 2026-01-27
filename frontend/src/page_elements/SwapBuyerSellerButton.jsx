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
  sellerName,
  buyerName,
  onSwapComplete,
}) => {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
          sx={{ 
            color: 'black',
            '&:hover': { 
              backgroundColor: 'rgba(0, 0, 0, 0.08)' 
            }
          }}
        >
          {loading ? <CircularProgress size={18} color="inherit" /> : <SwapHoriz />}
        </IconButton>
      </Tooltip>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Sukeisti pirkėją su pardavėju?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{sellerName || '—'}</strong> ↔ <strong>{buyerName || '—'}</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Atšaukti</Button>
          <Button onClick={handleSwap} variant="contained" color="primary">
            Sukeisti
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default SwapBuyerSellerButton;