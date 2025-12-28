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
  const url = file?.preview_url;

  if (!open || !url) return null;

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
          p: 0,
          height: "80vh",   // задаём явную высоту, чтобы iframe занял её целиком
        }}
      >
        <Box
          component="iframe"
          key={url} // чтобы при смене файла iframe перерисовывался
          src={url}
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