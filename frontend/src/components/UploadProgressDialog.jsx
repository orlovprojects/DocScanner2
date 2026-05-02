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

import { CloudUpload } from "@mui/icons-material";

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function UploadProgressDialog({
  open,
  uploadProgress,
  error,
  onCancel,
}) {
  const {
    current = 0,
    total = 0,
    bytes = 0,
    totalBytes = 0,
    phase = "uploading",
    currentFile = "",
  } = uploadProgress || {};

  const isUploadingPhase = phase === "uploading";
  const isFinalizingPhase = phase === "finalizing";

  const bytePercent = totalBytes > 0
    ? Math.min(Math.round((bytes / totalBytes) * 95), 95)
    : 0;

  const displayPercent = isFinalizingPhase ? 98 : bytePercent;
  const showIndeterminate = isFinalizingPhase;

  const statusText = isFinalizingPhase
    ? "Tikrinami kreditai..."
    : currentFile
      ? `Įkeliama: ${currentFile}`
      : "Įkeliami failai...";

  return (
    <Dialog open={open} maxWidth="xs" fullWidth disableScrollLock>
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
          {/* Прогресс бар */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Box sx={{ flex: 1 }}>
              {showIndeterminate ? (
                <LinearProgress
                  variant="indeterminate"
                  sx={{
                    height: 14,
                    borderRadius: 999,
                    backgroundColor: "action.hover",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 999,
                    },
                  }}
                />
              ) : (
                <LinearProgress
                  variant="determinate"
                  value={displayPercent}
                  sx={{
                    height: 14,
                    borderRadius: 999,
                    backgroundColor: "action.hover",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 999,
                      transition: "none",
                    },
                  }}
                />
              )}
            </Box>

            <Chip
              size="small"
              label={showIndeterminate ? "..." : `${displayPercent}%`}
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
        {isUploadingPhase && (
          <Button onClick={onCancel} color="inherit">
            Atšaukti
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}