import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  Chip,
  LinearProgress,
} from "@mui/material";

import { styled } from "@mui/material/styles";
import { CloudUpload } from "@mui/icons-material";

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const FancyProgress = styled(LinearProgress)(({ theme }) => ({
  height: "14px !important",
  borderRadius: 999,
  overflow: "hidden",
  backgroundColor: theme.palette.action.hover,

  "& .MuiLinearProgress-bar": {
    borderRadius: 999,
    position: "relative",
    transition: "transform 200ms linear",
  },

  // "Блик" поверх заполнения
  "& .MuiLinearProgress-bar::after": {
    content: '""',
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background:
      "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)",
    transform: "translateX(-70%)",
    animation: "shine 1.1s ease-in-out infinite",
    pointerEvents: "none",
  },

  "@keyframes shine": {
    "0%": { transform: "translateX(-70%)" },
    "100%": { transform: "translateX(70%)" },
  },
}));

export default function UploadProgressDialog({
  open,
  uploadProgress,
  error,
  onCancel,
}) {
  const { current, total, bytes, totalBytes, phase, currentFile } = uploadProgress;

  // Прогресс по байтам
  const bytePercent = totalBytes > 0
    ? Math.min(Math.round((bytes / totalBytes) * 95), 95) // максимум 95% пока загружаем
    : 0;

  // Когда finalizing — показываем 95-100%
  const displayPercent = phase === "finalizing" ? 98 : bytePercent;

  const statusText = phase === "finalizing" 
    ? "Tikrinami kreditai..." 
    : currentFile 
      ? `Įkeliama: ${currentFile}`
      : "Įkeliami failai...";

  return (
    <Dialog open={open} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CloudUpload color="primary" />
        Įkeliami failai...
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box>
          {/* Основной прогресс бар */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Box sx={{ flex: 1 }}>
              <FancyProgress
                variant={phase === "finalizing" ? "indeterminate" : "determinate"}
                value={displayPercent}
                sx={{
                  // если хочешь, чтобы "блик" не шёл во время finalizing:
                  "& .MuiLinearProgress-bar::after": {
                    animation: phase === "finalizing" ? "none" : "shine 1.1s ease-in-out infinite",
                  },
                }}
              />
            </Box>

            <Chip
              size="small"
              label={phase === "finalizing" ? "…" : `${displayPercent}%`}
              sx={{
                fontVariantNumeric: "tabular-nums",
                minWidth: 56,
                justifyContent: "center",
              }}
            />
          </Box>

          {/* Статус */}
          <Typography 
            variant="body2" 
            color="textSecondary" 
            sx={{ 
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              mb: 1,
            }}
          >
            {statusText}
          </Typography>

          {/* Детали */}
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="caption" color="textSecondary">
              {formatBytes(bytes)} / {formatBytes(totalBytes)}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Failų: {current} / {total}
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        {phase !== "finalizing" && (
          <Button onClick={onCancel} color="inherit">
            Atšaukti
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}