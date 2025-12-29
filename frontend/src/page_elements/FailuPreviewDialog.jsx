// page_elements/FailuPreviewDialog.jsx
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";

export default function FailuPreviewDialog({ open, onClose, file }) {
  const rawUrl = file?.preview_url;

  if (!open || !rawUrl) return null;

  // Чуть „отдаляем“ первую страницу: показываем целиком
  const pdfUrl = rawUrl.includes("#")
    ? rawUrl
    : `${rawUrl}#zoom=page-fit`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: "95%", md: "80%", lg: "70%" },
          maxHeight: "90vh",
        },
      }}
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
          p: 0,
          height: { xs: "70vh", md: "75vh" },
        }}
      >
        <Box
          component="iframe"
          key={pdfUrl}
          src={pdfUrl}
          title="Failo peržiūra"
          sx={{
            border: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
