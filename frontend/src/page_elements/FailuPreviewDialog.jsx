// page_elements/FailuPreviewDialog.jsx
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ZoomableImage from "../pages/ZoomableImage";

export default function FailuPreviewDialog({ open, onClose, file }) {
  if (!file) return null;

  // Поддерживаем и один url, и массив страниц
  let previewUrls = [];
  if (Array.isArray(file.preview_urls)) {
    previewUrls = file.preview_urls.slice(0, 5);
  } else if (file.preview_url) {
    previewUrls = [file.preview_url];
  }

  const hasPreview = previewUrls.length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
    >
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
        {file.original_filename || "Failo peržiūra"}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: "absolute",
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
          minHeight: 400,
          maxHeight: "80vh",
          p: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          bgcolor: "#f3f4f6",
        }}
      >
        {hasPreview ? (
          <Box
            sx={{
              flex: 1,
              height: "100%",
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 2,
              px: 2,
              gap: 2,
            }}
          >
            {previewUrls.map((url, idx) => (
              <Box
                key={idx}
                sx={{
                  width: "100%",
                  maxWidth: 1000,
                  // соотношение сторон условно “лист A4”
                  aspectRatio: "3 / 4",
                  bgcolor: "#fff",
                  borderRadius: 2,
                  boxShadow: "0 2px 8px #0001",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ZoomableImage src={url} />
              </Box>
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 4,
            }}
          >
            <Typography color="text.secondary">
              Peržiūra negalima
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
