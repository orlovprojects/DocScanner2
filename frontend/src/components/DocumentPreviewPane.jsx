import { Box, Typography } from "@mui/material";
import DescriptionIcon from "@mui/icons-material/Description";
import ZoomableImage from "../pages/ZoomableImage";

export default function DocumentPreviewPane({
  url,
  maxHeight = "100%",
  buttonSize = 36,
  fitRatio = 0.95,
  emptyText = "Peržiūra nepasiekiama",
}) {
  if (!url) {
    return (
      <Box
        sx={{
          height: "100%",
          minHeight: 260,
          borderRadius: 2,
          border: "2px dashed",
          borderColor: "divider",
          bgcolor: "#fafafa",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <DescriptionIcon sx={{ fontSize: 44, color: "#bdbdbd" }} />
        <Typography variant="body2" color="text.secondary">
          {emptyText}
        </Typography>
      </Box>
    );
  }

  const isPdf = String(url).split("?")[0].toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return (
      <Box
        component="iframe"
        src={url}
        sx={{
          width: "100%",
          height: maxHeight === "100%" ? "100%" : maxHeight,
          minHeight: 320,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          display: "block",
          bgcolor: "#f8f8f8",
        }}
      />
    );
  }

  return (
    <ZoomableImage
      src={url}
      buttonSize={buttonSize}
      maxHeight={maxHeight}
      fitOnLoad
      fitRatio={fitRatio}
    />
  );
}