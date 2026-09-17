import { Box, Typography } from "@mui/material";
import ZoomableImage from "../pages/ZoomableImage";

export default function DocumentImagePane({ src, maxHeight = "calc(85vh - 160px)", minHeight = 300 }) {
  if (!src) {
    return (
      <Box
        sx={{
          height: "100%",
          minHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "#fafafa",
          borderRadius: 2,
          border: "1px dashed",
          borderColor: "divider",
        }}
      >
        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>Peržiūra negalima</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        minHeight,
        bgcolor: "#fafafa",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        p: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <ZoomableImage src={src} buttonSize={34} maxHeight={maxHeight} fitOnLoad fitRatio={0.95} />
    </Box>
  );
}