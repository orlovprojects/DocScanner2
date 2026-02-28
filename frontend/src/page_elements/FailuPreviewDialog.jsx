// page_elements/FailuPreviewDialog.jsx
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import ZoomableImage from "../pages/ZoomableImage";

const IMG_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".jpe", ".webp", ".bmp",
  ".tif", ".tiff", ".heic", ".heif", ".avif", ".gif",
]);
const PDF_EXTS = new Set([".pdf"]);
const OFFICE_EXTS = new Set([".doc", ".docx", ".xls", ".xlsx"]);
const ARCHIVE_EXTS = new Set([".zip", ".rar", ".7z", ".tar", ".tgz", ".tbz2"]);

function getExt(filename) {
  if (!filename) return "";
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export default function FailuPreviewDialog({ open, onClose, file }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const rawUrl = file?.preview_url;
  if (!open || !rawUrl) return null;

  const ext = getExt(file?.original_filename);
  const isImage = IMG_EXTS.has(ext);
  const isPdf = PDF_EXTS.has(ext);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      disableScrollLock
      PaperProps={{
        sx: isMobile
          ? { m: 0, height: "100dvh", borderRadius: 0 }
          : {
              width: { xs: "100%", sm: "95%", md: "80%", lg: "70%" },
              maxHeight: "90vh",
            },
      }}
    >
      <DialogTitle
        sx={{
          fontWeight: 500,
          fontSize: isMobile ? 14 : 18,
          pr: 6,
          pb: 1,
          position: "relative",
          minHeight: 44,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {file.original_filename || "Failo peržiūra"}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            color: (t) => t.palette.grey[500],
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: isImage ? "#f5f5f5" : "transparent",
        }}
      >
        {isImage ? (
          <ZoomableImage
            src={rawUrl}
            buttonSize={isMobile ? 0 : 36}
            initialZoom={0.60}
            maxHeight={isMobile ? "calc(100dvh - 100px)" : "calc(75vh - 60px)"}
          />
        ) : isPdf ? (
          <Box
            component="iframe"
            key={rawUrl.includes("#") ? rawUrl : `${rawUrl}#zoom=page-fit`}
            src={rawUrl.includes("#") ? rawUrl : `${rawUrl}#zoom=page-fit`}
            title="Failo peržiūra"
            sx={{ border: 0, width: "100%", height: "100%" }}
          />
        ) : (
          <Box sx={{ textAlign: "center", py: 6, px: 2 }}>
            <Typography color="text.secondary" gutterBottom>
              Šio failo formato peržiūra negalima
            </Typography>
            <Typography
              component="a"
              href={rawUrl}
              download={file.original_filename}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "primary.main", textDecoration: "underline" }}
            >
              Atsisiųsti failą
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}




// // page_elements/FailuPreviewDialog.jsx
// import {
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   IconButton,
// } from "@mui/material";
// import CloseIcon from "@mui/icons-material/Close";
// import Box from "@mui/material/Box";

// export default function FailuPreviewDialog({ open, onClose, file }) {
//   const rawUrl = file?.preview_url;

//   if (!open || !rawUrl) return null;

//   // Чуть „отдаляем“ первую страницу: показываем целиком
//   const pdfUrl = rawUrl.includes("#")
//     ? rawUrl
//     : `${rawUrl}#zoom=page-fit`;

//   return (
//     <Dialog
//       open={open}
//       onClose={onClose}
//       maxWidth="lg"
//       fullWidth
//       PaperProps={{
//         sx: {
//           width: { xs: "100%", sm: "95%", md: "80%", lg: "70%" },
//           maxHeight: "90vh",
//         },
//       }}
//     >
//       <DialogTitle
//         sx={{
//           fontWeight: 500,
//           fontSize: 18,
//           pr: 5,
//           pb: 1,
//           position: "relative",
//           minHeight: 44,
//         }}
//       >
//         {file.original_filename || "Failo peržiūra"}
//         <IconButton
//           aria-label="close"
//           onClick={onClose}
//           sx={{
//             position: "absolute",
//             right: 10,
//             top: 8,
//             color: (theme) => theme.palette.grey[500],
//             p: 1,
//           }}
//         >
//           <CloseIcon />
//         </IconButton>
//       </DialogTitle>

//       <DialogContent
//         dividers
//         sx={{
//           p: 0,
//           height: { xs: "70vh", md: "75vh" },
//         }}
//       >
//         <Box
//           component="iframe"
//           key={pdfUrl}
//           src={pdfUrl}
//           title="Failo peržiūra"
//           sx={{
//             border: 0,
//             width: "100%",
//             height: "100%",
//           }}
//         />
//       </DialogContent>
//     </Dialog>
//   );
// }
