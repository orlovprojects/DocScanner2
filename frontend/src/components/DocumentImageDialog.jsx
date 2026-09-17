import { useEffect, useState } from "react";
import { Box, CircularProgress, Dialog, IconButton, Typography, useMediaQuery, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { api } from "../api/endpoints";
import DocumentImagePane from "./DocumentImagePane";

export default function DocumentImageDialog({ open, onClose, purchaseId }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [loading, setLoading] = useState(false);
  const [purchase, setPurchase] = useState(null);

  useEffect(() => {
    if (!open || !purchaseId) return;

    let cancelled = false;
    setLoading(true);
    setPurchase(null);

    api
      .get(`/purchases/${purchaseId}/`, { withCredentials: true })
      .then(({ data }) => {
        if (!cancelled) setPurchase(data);
      })
      .catch(() => {
        if (!cancelled) setPurchase(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, purchaseId]);

  const number = purchase
    ? `${purchase.document_series || ""}${purchase.document_number || ""}`
    : "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={isMobile}
      disableScrollLock
      PaperProps={{ sx: isMobile ? {} : { borderRadius: "14px", height: "90vh" } }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 1.2,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <Typography sx={{ fontSize: 15, fontWeight: 700 }} noWrap>
          {number || "Dokumentas"}
          {purchase?.seller_name && (
            <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>
              {purchase.seller_name}
            </Typography>
          )}
        </Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, p: 2, minHeight: 0 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <DocumentImagePane src={purchase?.preview_url} maxHeight="calc(90vh - 120px)" />
        )}
      </Box>
    </Dialog>
  );
}