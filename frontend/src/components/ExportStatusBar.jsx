import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Box,
  LinearProgress,
  Typography,
  IconButton,
  Collapse,
  Paper,
  Chip,
  Tooltip,
} from "@mui/material";
import { linearProgressClasses } from "@mui/material/LinearProgress";
import {
  ExpandMore,
  ExpandLess,
  CloudSync,
  CheckCircle,
  Error as ErrorIcon,
  WarningAmber,
} from "@mui/icons-material";
import { styled, keyframes } from "@mui/material/styles";
import { api } from "../api/endpoints";

const POLL_INTERVAL = 2000;
const DONE_DISPLAY_MS = 5000;

const syncPulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
`;

const EXPORT_PURPLE = "#7c4dff";
const EXPORT_PURPLE_LIGHT = "#b388ff";
const COMPLETED_GREEN = "#4caf50";
const ERROR_RED = "#f44336";

const ExportProgress = styled(LinearProgress)(({ theme }) => ({
  height: 10,
  borderRadius: 5,
  backgroundColor: theme.palette.grey[200],
  [`& .${linearProgressClasses.bar}`]: {
    borderRadius: 5,
  },
}));

export default function ExportStatusBar({ onExportComplete }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const [completedSession, setCompletedSession] = useState(null);
  const [showingCompleted, setShowingCompleted] = useState(false);

  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  const completedIdsRef = useRef(new Set());

  const activeSession = useMemo(
    () => sessions.find((s) => ["processing", "queued"].includes(s.stage)) || null,
    [sessions]
  );

  const doneSession = useMemo(
    () => sessions.find((s) => s.stage === "done") || null,
    [sessions]
  );

  const displaySession = showingCompleted ? completedSession : (activeSession || doneSession);

  const total = displaySession?.total_documents || 0;
  const processed = displaySession?.processed_documents || 0;
  const successCount = displaySession?.success_count || 0;
  const partialCount = displaySession?.partial_count || 0;
  const errorCount = displaySession?.error_count || 0;

  const isCompleted = displaySession?.stage === "done" || showingCompleted;
  const isQueued = displaySession?.stage === "queued";

  const percent = useMemo(() => {
    if (isCompleted) return 100;
    if (!total) return 0;
    return Math.max(0, Math.min(99, Math.round((processed / total) * 100)));
  }, [isCompleted, total, processed]);

  // Цвет бара зависит от результата
  const barColor = useMemo(() => {
    if (!isCompleted) return EXPORT_PURPLE;
    if (errorCount > 0 && successCount === 0 && partialCount === 0) return ERROR_RED;
    if (errorCount > 0 || partialCount > 0) return "#ff9800"; // orange — mixed
    return COMPLETED_GREEN;
  }, [isCompleted, errorCount, successCount, partialCount]);

  const headerBgColor = useMemo(() => {
    if (!isCompleted) return EXPORT_PURPLE;
    if (errorCount > 0 && successCount === 0 && partialCount === 0) return ERROR_RED;
    if (errorCount > 0 || partialCount > 0) return "#ff9800";
    return COMPLETED_GREEN;
  }, [isCompleted, errorCount, successCount, partialCount]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchActiveSessions = useCallback(async () => {
    try {
      const { data } = await api.get("/export-sessions/active/", {
        withCredentials: true,
      });

      const allSessions = data.sessions || [];

      // Detect newly completed
      const newDone = allSessions.find(
        (s) => s.stage === "done" && !completedIdsRef.current.has(s.id)
      );

      if (newDone) {
        completedIdsRef.current.add(newDone.id);
        setCompletedSession(newDone);
        setShowingCompleted(true);

        try {
          await onExportComplete?.(newDone);
        } catch (e) {
          console.error("onExportComplete failed:", e);
        }

        setTimeout(() => {
          if (mountedRef.current) {
            setShowingCompleted(false);
            setCompletedSession(null);
          }
        }, DONE_DISPLAY_MS);
      }

      const activeSessions = allSessions.filter((s) =>
        ["processing", "queued"].includes(s.stage)
      );

      setSessions(activeSessions);
    } catch (e) {
      console.error("Failed to fetch export sessions:", e);
    } finally {
      setLoading(false);
    }
  }, [onExportComplete]);

  useEffect(() => {
    mountedRef.current = true;
    fetchActiveSessions();

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [fetchActiveSessions, stopPolling]);

  useEffect(() => {
    const shouldPoll = sessions.length > 0 || showingCompleted;

    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(fetchActiveSessions, POLL_INTERVAL);
    }

    if (!shouldPoll && pollRef.current) {
      stopPolling();
    }

    return () => {
      if (!shouldPoll) stopPolling();
    };
  }, [sessions.length, showingCompleted, fetchActiveSessions, stopPolling]);

  // Trigger initial poll when export starts from parent
  const triggerPoll = useCallback(() => {
    fetchActiveSessions();
    if (!pollRef.current) {
      pollRef.current = setInterval(fetchActiveSessions, POLL_INTERVAL);
    }
  }, [fetchActiveSessions]);

  // Expose triggerPoll via ref-like pattern
  useEffect(() => {
    if (ExportStatusBar._triggerPoll !== triggerPoll) {
      ExportStatusBar._triggerPoll = triggerPoll;
    }
  }, [triggerPoll]);

  if (!showingCompleted && sessions.length === 0 && !loading) return null;
  if (!showingCompleted && loading && sessions.length === 0) return null;

  const showProgress = !!displaySession;

  const programLabel = displaySession?.program
    ? displaySession.program.charAt(0).toUpperCase() + displaySession.program.slice(1)
    : "";

  const headerTitle = isCompleted
    ? `${programLabel} eksportas baigtas`
    : isQueued
      ? `${programLabel} eksportas laukia...`
      : `Eksportuojama į ${programLabel}...`;

  const headerSub = showProgress && total
    ? `${processed} / ${total} dokumentų`
    : "";

  const totalTime = displaySession?.total_time_seconds;

  return (
    <Paper
      elevation={2}
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1099,
        mb: 2,
        overflow: "visible",
        borderRadius: 2,
        border: `1px solid ${isCompleted ? barColor : EXPORT_PURPLE_LIGHT}33`,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.25,
          bgcolor: headerBgColor,
          color: "white",
          cursor: "pointer",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          animation: !isCompleted && showProgress ? `${syncPulse} 2s ease-in-out infinite` : "none",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {isCompleted ? (
            errorCount > 0 && successCount === 0 && partialCount === 0 ? (
              <ErrorIcon fontSize="small" />
            ) : (
              <CheckCircle fontSize="small" />
            )
          ) : (
            <CloudSync
              fontSize="small"
              sx={{
                animation: "spin 2s linear infinite",
                "@keyframes spin": {
                  "0%": { transform: "rotate(0deg)" },
                  "100%": { transform: "rotate(360deg)" },
                },
              }}
            />
          )}

          <Box>
            <Typography variant="body2" fontWeight={600}>
              {headerTitle}
            </Typography>
            {headerSub && (
              <Typography variant="caption" sx={{ opacity: 0.9 }}>
                {headerSub}
              </Typography>
            )}
          </Box>
        </Box>

        <IconButton size="small" sx={{ color: "white" }}>
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      {/* Body */}
      <Collapse in={expanded}>
        {showProgress && (
          <Box sx={{ px: 2, pt: 1.5, pb: 1.5, bgcolor: "background.paper" }}>
            {/* Progress bar */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.75,
              }}
            >
              <Typography variant="body2" color="textSecondary" fontWeight={500}>
                {isQueued ? "Laukiama eilėje..." : "Eksporto progresas"}
              </Typography>

              <Chip
                label={`${percent}%`}
                size="small"
                sx={{
                  fontWeight: 600,
                  minWidth: 56,
                  bgcolor: `${barColor}18`,
                  color: barColor,
                  border: `1px solid ${barColor}44`,
                }}
              />
            </Box>

            <ExportProgress
              variant={isQueued ? "indeterminate" : "determinate"}
              value={isQueued ? undefined : percent}
              sx={{
                [`& .${linearProgressClasses.bar}`]: {
                  backgroundColor: barColor,
                },
              }}
            />

            {/* Counters */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mt: 1,
              }}
            >
              {/* Left: time */}
              <Typography variant="caption" color="textSecondary">
                {isCompleted && totalTime != null
                  ? `Laikas: ${totalTime.toFixed(1)}s`
                  : `${total} dokumentų iš viso`}
              </Typography>

              {/* Right: status counters */}
              <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                <Tooltip title="Sėkmingai išsiųsta" arrow>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                    <CheckCircle
                      sx={{
                        fontSize: 15,
                        color: successCount > 0 ? COMPLETED_GREEN : "text.disabled",
                      }}
                    />
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      color={successCount > 0 ? COMPLETED_GREEN : "text.disabled"}
                    >
                      {successCount}
                    </Typography>
                  </Box>
                </Tooltip>

                <Tooltip title="Dalinai išiųsta" arrow>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                    <WarningAmber
                      sx={{
                        fontSize: 15,
                        color: partialCount > 0 ? "#ff9800" : "text.disabled",
                      }}
                    />
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      color={partialCount > 0 ? "#ff9800" : "text.disabled"}
                    >
                      {partialCount}
                    </Typography>
                  </Box>
                </Tooltip>

                <Tooltip title="Klaida (neišsiųsta)" arrow>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                    <ErrorIcon
                      sx={{
                        fontSize: 15,
                        color: errorCount > 0 ? ERROR_RED : "text.disabled",
                      }}
                    />
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      color={errorCount > 0 ? ERROR_RED : "text.disabled"}
                    >
                      {errorCount}
                    </Typography>
                  </Box>
                </Tooltip>
              </Box>
            </Box>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}