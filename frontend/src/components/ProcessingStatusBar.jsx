import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Box,
  LinearProgress,
  Typography,
  IconButton,
  Collapse,
  Paper,
  Chip,
  Button,
} from "@mui/material";
import { linearProgressClasses } from "@mui/material/LinearProgress";
import {
  ExpandMore,
  ExpandLess,
  HourglassEmpty,
  Queue,
  CheckCircle,
  Error,
} from "@mui/icons-material";
import { styled, keyframes } from "@mui/material/styles";
import { api } from "../api/endpoints";

const POLL_INTERVAL = 2000;
const DONE_DISPLAY_MS = 3000;

// Плавная анимация: +0.5% каждые 100ms
const UI_TICK_MS = 100;
const UI_STEP = 0.5;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
`;

const COMPLETED_GREEN = "#4caf50";

const FancyProgress = styled(LinearProgress)(({ theme }) => ({
  height: 12,
  borderRadius: 6,
  backgroundColor: theme.palette.grey[300],

  [`& .${linearProgressClasses.bar}`]: {
    borderRadius: 6,
  },
}));

export default function ProcessingStatusBar({ onSessionComplete }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  // Плавный UI процент
  const [uiPercent, setUiPercent] = useState(0);
  const animRef = useRef(null);

  const realPercentRef = useRef(0);
  const maxAllowedRef = useRef(0);

  // Трекаем ID текущей активной сессии — при смене сбрасываем процент
  const activeSessionIdRef = useRef(null);

  // Для плавного показа "Baigta" после завершения
  const [completedSession, setCompletedSession] = useState(null);
  const [showingCompleted, setShowingCompleted] = useState(false);

  // Blocked session actions
  const [retryLoading, setRetryLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  const completedIdsRef = useRef(new Set());

  const queuedSessions = useMemo(
    () => sessions.filter((s) => s.stage === "queued"),
    [sessions]
  );

  const activeSession = useMemo(
    () =>
      sessions.find((s) =>
        ["processing", "credit_check"].includes(s.stage)
      ) || null,
    [sessions]
  );

  const blockedSession = useMemo(
    () => sessions.find((s) => s.stage === "blocked") || null,
    [sessions]
  );

  const doneSession = useMemo(
    () => sessions.find((s) => s.stage === "done") || null,
    [sessions]
  );

  const displaySession = showingCompleted
    ? completedSession
    : activeSession || doneSession;

  const total =
    displaySession?.expected_items || displaySession?.actual_items || 0;
  const processed = displaySession?.processed_items || 0;
  const done = displaySession?.done_items || 0;
  const failed = displaySession?.failed_items || 0;

  const isCreditCheck = displaySession?.stage === "credit_check";
  const isCompleted = displaySession?.stage === "done" || showingCompleted;
  const isBlocked = blockedSession != null;

  // Сброс процента при смене активной сессии
  useEffect(() => {
    const currentId = activeSession?.id || null;
    if (currentId && currentId !== activeSessionIdRef.current) {
      // Новая сессия началась — сброс
      setUiPercent(0);
      realPercentRef.current = 0;
      maxAllowedRef.current = 0;
    }
    activeSessionIdRef.current = currentId;
  }, [activeSession?.id]);

  // Реальный процент с бэкенда
  const realPercent = useMemo(() => {
    if (isCompleted) return 100;
    if (!total) return 0;
    return Math.max(0, Math.min(100, (processed / total) * 100));
  }, [isCompleted, total, processed]);

  // Максимум куда можно дойти плавно
  const maxAllowed = useMemo(() => {
    if (isCompleted) return 100;
    if (!total) return 15;
    const oneFilePercent = 100 / total;
    return Math.min(99, realPercent + oneFilePercent * 0.95);
  }, [isCompleted, total, realPercent]);

  // Стоп анимации
  const stopAnim = useCallback(() => {
    if (animRef.current) {
      clearInterval(animRef.current);
      animRef.current = null;
    }
  }, []);

  // Запуск анимации
  const startAnim = useCallback(() => {
    if (animRef.current) return;

    animRef.current = setInterval(() => {
      setUiPercent((prev) => {
        const max = maxAllowedRef.current;
        const real = realPercentRef.current;

        if (prev >= max) return prev;
        if (real > prev) return real;

        const next = prev + UI_STEP;
        return Math.min(max, next);
      });
    }, UI_TICK_MS);
  }, []);

  // Обновляем refs когда меняются значения
  useEffect(() => {
    realPercentRef.current = realPercent;
    maxAllowedRef.current = maxAllowed;

    setUiPercent((prev) => Math.max(prev, realPercent));

    if (isCompleted) {
      setUiPercent(100);
      stopAnim();
    }
  }, [realPercent, maxAllowed, isCompleted, stopAnim]);

  // Запускаем анимацию когда есть активная сессия
  useEffect(() => {
    if (displaySession && !isCompleted) {
      startAnim();
    } else {
      stopAnim();
    }
  }, [displaySession, isCompleted, startAnim, stopAnim]);

  // Сброс при исчезновении сессии
  useEffect(() => {
    if (!displaySession && !showingCompleted) {
      setUiPercent(0);
      realPercentRef.current = 0;
      maxAllowedRef.current = 0;
      stopAnim();
    }
  }, [displaySession, showingCompleted, stopAnim]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAnim();
    };
  }, [stopAnim]);

  const fetchActiveSessions = useCallback(async () => {
    try {
      const { data } = await api.get("/sessions/active/", {
        withCredentials: true,
      });

      const allSessions = data.sessions || [];

      const newDone = allSessions.find(
        (s) => s.stage === "done" && !completedIdsRef.current.has(s.id)
      );

      if (newDone) {
        completedIdsRef.current.add(newDone.id);
        setCompletedSession(newDone);
        setShowingCompleted(true);

        try {
          await onSessionComplete?.(newDone.id);
        } catch (e) {
          console.error("onSessionComplete failed:", e);
        }

        setTimeout(() => {
          if (mountedRef.current) {
            setShowingCompleted(false);
            setCompletedSession(null);
          }
        }, DONE_DISPLAY_MS);
      }

      const activeSessions = allSessions.filter((s) =>
        ["processing", "queued", "credit_check", "blocked"].includes(s.stage)
      );

      setSessions(activeSessions);
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
    } finally {
      setLoading(false);
    }
  }, [onSessionComplete]);

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

  // ─── Blocked session handlers ───

  const handleRetryBlocked = async (sessionId) => {
    setRetryLoading(true);
    try {
      await api.post(`/web/sessions/${sessionId}/retry/`);
      await fetchActiveSessions();
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setRetryLoading(false);
    }
  };

  const handleCancelBlocked = async (sessionId) => {
    setCancelLoading(true);
    try {
      await api.post(`/web/sessions/${sessionId}/cancel/`);
      await fetchActiveSessions();
    } catch (e) {
      console.error("Cancel failed:", e);
    } finally {
      setCancelLoading(false);
    }
  };

  // ─── Visibility ───

  const hasAnything =
    showingCompleted || sessions.length > 0 || isBlocked;

  if (!hasAnything && !loading) return null;
  if (!hasAnything && loading) return null;

  const showProgress = !!displaySession;

  // ─── Header ───

  const headerTitle = isCompleted
    ? "Baigta 🏁"
    : isBlocked && !showProgress
      ? "Nepakanka kreditų"
      : isCreditCheck
        ? "Tikrinami kreditai..."
        : showProgress
          ? "Apdorojami failai..."
          : isBlocked
            ? "Nepakanka kreditų"
            : `Eilėje: ${queuedSessions.length} užduotys`;

  const headerSub =
    showProgress && total
      ? isCompleted
        ? `${done + failed} / ${total} failų apdorota`
        : `${processed} / ${total} failų`
      : showProgress
        ? "Vykdoma..."
        : "";

  const barVariant =
    isCreditCheck && !isCompleted ? "indeterminate" : "determinate";
  const displayPercent = Math.round(uiPercent) || 0;
  const barValue =
    barVariant === "determinate"
      ? Math.max(0, Math.min(100, displayPercent))
      : undefined;

  const headerBgColor = isCompleted
    ? COMPLETED_GREEN
    : isBlocked
      ? "error.main"
      : showProgress
        ? "primary.main"
        : "grey.500";

  return (
    <Paper
      elevation={3}
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        mb: 2,
        overflow: "visible",
        borderRadius: 2,
      }}
    >
      {/* ─── Header ─── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          bgcolor: headerBgColor,
          color: "white",
          cursor: "pointer",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          animation:
            showProgress && !isCompleted && !isBlocked
              ? `${pulse} 2s ease-in-out infinite`
              : "none",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {isCompleted ? (
            <CheckCircle fontSize="small" />
          ) : isBlocked ? (
            <Error fontSize="small" />
          ) : showProgress ? (
            <HourglassEmpty
              fontSize="small"
              sx={{
                animation: "spin 2s linear infinite",
                "@keyframes spin": {
                  "0%": { transform: "rotate(0deg)" },
                  "100%": { transform: "rotate(360deg)" },
                },
              }}
            />
          ) : (
            <Queue fontSize="small" />
          )}

          <Box>
            <Typography variant="body2" fontWeight={600}>
              {headerTitle}
            </Typography>
            {showProgress && headerSub && (
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

      {/* ─── Progress bar (only for active/done sessions, not blocked-only) ─── */}
      {showProgress && !isBlocked && (
        <Box sx={{ px: 2, pt: 1.5, pb: 1.5, bgcolor: "background.paper" }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 0.75,
            }}
          >
            <Typography
              variant="body2"
              color="textSecondary"
              fontWeight={500}
            >
              Progresas
            </Typography>

            <Chip
              label={`${displayPercent}%`}
              size="small"
              color={isCompleted ? "success" : "primary"}
              sx={{ fontWeight: 600, minWidth: 56 }}
            />
          </Box>

          <FancyProgress
            variant={barVariant}
            value={barValue}
            sx={{
              [`& .${linearProgressClasses.bar}`]: {
                backgroundColor: isCompleted ? COMPLETED_GREEN : undefined,
              },
            }}
          />

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mt: 0.75,
            }}
          >
            <Typography variant="caption" color="textSecondary">
              {displaySession?.uploaded_files || 0} failų įkelta
            </Typography>

            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <CheckCircle
                  sx={{
                    fontSize: 14,
                    color: done > 0 ? "success.main" : "text.disabled",
                  }}
                />
                <Typography
                  variant="caption"
                  color={done > 0 ? "success.main" : "text.disabled"}
                  fontWeight={600}
                >
                  {done}
                </Typography>
              </Box>

              <Box
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <Error
                  sx={{
                    fontSize: 14,
                    color: failed > 0 ? "error.main" : "text.disabled",
                  }}
                />
                <Typography
                  variant="caption"
                  color={failed > 0 ? "error.main" : "text.disabled"}
                  fontWeight={600}
                >
                  {failed}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {/* ─── Expandable content ─── */}
      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, pt: showProgress && !isBlocked ? 0 : 2 }}>
          {/* Blocked session */}
          {blockedSession && (
            <Box
              sx={{
                pb: queuedSessions.length > 0 ? 1.5 : 0,
              }}
            >
              <Typography
                variant="body2"
                color="error.main"
                sx={{ mb: 1.5 }}
              >
                {blockedSession.error_message || "Nepakanka kreditų"}
              </Typography>

              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={retryLoading || cancelLoading}
                  onClick={() => handleRetryBlocked(blockedSession.id)}
                >
                  {retryLoading ? "Tikrinama..." : "Pakartoti"}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={retryLoading || cancelLoading}
                  onClick={() => handleCancelBlocked(blockedSession.id)}
                >
                  {cancelLoading ? "Naikinama..." : "Panaikinti užduotį"}
                </Button>
              </Box>
            </Box>
          )}

          {/* Queued sessions */}
          {queuedSessions.length > 0 && !isCompleted && (
            <Box
              sx={{
                pt: showProgress || isBlocked ? 1 : 0,
                borderTop:
                  showProgress || isBlocked ? "1px solid" : "none",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="body2"
                color="textSecondary"
                fontWeight={500}
                gutterBottom
              >
                Eilėje laukia:
              </Typography>

              {queuedSessions.map((s, idx) => (
                <Box
                  key={s.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    py: 0.5,
                  }}
                >
                  <Queue fontSize="small" color="action" />
                  <Typography variant="body2">
                    Užduotis #{idx + 1}
                  </Typography>
                  <Chip
                    label={`${s.expected_items || s.uploaded_files || 0} failų`}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}




// import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
// import {
//   Box,
//   LinearProgress,
//   Typography,
//   IconButton,
//   Collapse,
//   Paper,
//   Chip,
// } from "@mui/material";
// import { linearProgressClasses } from "@mui/material/LinearProgress";
// import {
//   ExpandMore,
//   ExpandLess,
//   HourglassEmpty,
//   Queue,
//   CheckCircle,
//   Error,
// } from "@mui/icons-material";
// import { styled, keyframes } from "@mui/material/styles";
// import { api } from "../api/endpoints";

// const POLL_INTERVAL = 2000;
// const DONE_DISPLAY_MS = 3000;

// // Плавная анимация: +0.5% каждые 100ms
// const UI_TICK_MS = 100;
// const UI_STEP = 0.5;

// const pulse = keyframes`
//   0%, 100% { opacity: 1; }
//   50% { opacity: 0.85; }
// `;

// // Кастомный зелёный для completed состояния
// const COMPLETED_GREEN = "#4caf50";

// const FancyProgress = styled(LinearProgress)(({ theme }) => ({
//   height: 12,
//   borderRadius: 6,
//   backgroundColor: theme.palette.grey[300],
  
//   [`& .${linearProgressClasses.bar}`]: {
//     borderRadius: 6,
//   },
// }));

// export default function ProcessingStatusBar({ onSessionComplete }) {
//   const [sessions, setSessions] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [expanded, setExpanded] = useState(true);

//   // Плавный UI процент (может быть дробным внутри, округляем при показе)
//   const [uiPercent, setUiPercent] = useState(0);
//   const animRef = useRef(null);
  
//   // Храним реальный процент и лимит (чтобы не прыгать вперёд)
//   const realPercentRef = useRef(0);
//   const maxAllowedRef = useRef(0);

//   // Для плавного показа "Baigta" после завершения
//   const [completedSession, setCompletedSession] = useState(null);
//   const [showingCompleted, setShowingCompleted] = useState(false);

//   const pollRef = useRef(null);
//   const mountedRef = useRef(true);
//   const completedIdsRef = useRef(new Set());

//   const queuedSessions = useMemo(
//     () => sessions.filter((s) => s.stage === "queued"),
//     [sessions]
//   );

//   const activeSession = useMemo(
//     () => sessions.find((s) => ["processing", "credit_check"].includes(s.stage)) || null,
//     [sessions]
//   );

//   const doneSession = useMemo(
//     () => sessions.find((s) => s.stage === "done") || null,
//     [sessions]
//   );

//   const displaySession = showingCompleted ? completedSession : (activeSession || doneSession);

//   const total = displaySession?.expected_items || displaySession?.actual_items || 0;
//   const processed = displaySession?.processed_items || 0;
//   const done = displaySession?.done_items || 0;
//   const failed = displaySession?.failed_items || 0;

//   const isCreditCheck = displaySession?.stage === "credit_check";
//   const isCompleted = displaySession?.stage === "done" || showingCompleted;

//   // Реальный процент с бэкенда
//   const realPercent = useMemo(() => {
//     if (isCompleted) return 100;
//     if (!total) return 0;
//     return Math.max(0, Math.min(100, (processed / total) * 100));
//   }, [isCompleted, total, processed]);

//   // Максимум куда можно дойти плавно = realPercent + (100/total) - небольшой запас
//   const maxAllowed = useMemo(() => {
//     if (isCompleted) return 100;
//     if (!total) {
//       // Если total ещё неизвестен — разрешаем до 15% для визуального feedback
//       return 15;
//     }
//     // Доля одного файла
//     const oneFilePercent = 100 / total;
//     // Разрешаем идти до realPercent + почти один файл (95% от доли)
//     return Math.min(99, realPercent + oneFilePercent * 0.95);
//   }, [isCompleted, total, realPercent]);

//   // Стоп анимации
//   const stopAnim = useCallback(() => {
//     if (animRef.current) {
//       clearInterval(animRef.current);
//       animRef.current = null;
//     }
//   }, []);

//   // Запуск анимации
//   const startAnim = useCallback(() => {
//     if (animRef.current) return;
    
//     animRef.current = setInterval(() => {
//       setUiPercent((prev) => {
//         const max = maxAllowedRef.current;
//         const real = realPercentRef.current;
        
//         // Если уже достигли лимита — стоим
//         if (prev >= max) return prev;
        
//         // Если реальный процент больше текущего — прыгаем к нему
//         if (real > prev) {
//           return real;
//         }
        
//         // Иначе плавно растём, но не выше max
//         const next = prev + UI_STEP;
//         return Math.min(max, next);
//       });
//     }, UI_TICK_MS);
//   }, []);

//   // Обновляем refs когда меняются значения
//   useEffect(() => {
//     realPercentRef.current = realPercent;
//     maxAllowedRef.current = maxAllowed;
    
//     // Если realPercent вырос — uiPercent должен прыгнуть к нему
//     setUiPercent((prev) => Math.max(prev, realPercent));
    
//     // Если завершено — сразу 100
//     if (isCompleted) {
//       setUiPercent(100);
//       stopAnim();
//     }
//   }, [realPercent, maxAllowed, isCompleted, stopAnim]);

//   // Запускаем анимацию когда есть активная сессия
//   useEffect(() => {
//     if (displaySession && !isCompleted) {
//       startAnim();
//     } else {
//       stopAnim();
//     }
//   }, [displaySession, isCompleted, startAnim, stopAnim]);

//   // Сброс при исчезновении сессии
//   useEffect(() => {
//     if (!displaySession && !showingCompleted) {
//       setUiPercent(0);
//       realPercentRef.current = 0;
//       maxAllowedRef.current = 0;
//       stopAnim();
//     }
//   }, [displaySession, showingCompleted, stopAnim]);

//   const stopPolling = useCallback(() => {
//     if (pollRef.current) {
//       clearInterval(pollRef.current);
//       pollRef.current = null;
//     }
//   }, []);

//   // Cleanup
//   useEffect(() => {
//     return () => {
//       stopAnim();
//     };
//   }, [stopAnim]);

//   const fetchActiveSessions = useCallback(async () => {
//     try {
//       const { data } = await api.get("/sessions/active/", {
//         withCredentials: true,
//       });

//       const allSessions = data.sessions || [];
      
//       const newDone = allSessions.find(
//         (s) => s.stage === "done" && !completedIdsRef.current.has(s.id)
//       );

//         if (newDone) {
//         completedIdsRef.current.add(newDone.id);
//         setCompletedSession(newDone);
//         setShowingCompleted(true);

//         try {
//             await onSessionComplete?.(newDone.id);  // ← Передаём sessionId
//         } catch (e) {
//             console.error("onSessionComplete failed:", e);
//         }

//         setTimeout(() => {
//             if (mountedRef.current) {
//             setShowingCompleted(false);
//             setCompletedSession(null);
//             }
//         }, DONE_DISPLAY_MS);
//         }

//       const activeSessions = allSessions.filter((s) =>
//         ["processing", "queued", "credit_check"].includes(s.stage)
//       );

//       setSessions(activeSessions);

//     } catch (e) {
//       console.error("Failed to fetch sessions:", e);
//     } finally {
//       setLoading(false);
//     }
//   }, [onSessionComplete]);

//   useEffect(() => {
//     mountedRef.current = true;
//     fetchActiveSessions();

//     return () => {
//       mountedRef.current = false;
//       stopPolling();
//     };
//   }, [fetchActiveSessions, stopPolling]);

//   useEffect(() => {
//     const shouldPoll = sessions.length > 0 || showingCompleted;

//     if (shouldPoll && !pollRef.current) {
//       pollRef.current = setInterval(fetchActiveSessions, POLL_INTERVAL);
//     }

//     if (!shouldPoll && pollRef.current) {
//       stopPolling();
//     }

//     return () => {
//       if (!shouldPoll) stopPolling();
//     };
//   }, [sessions.length, showingCompleted, fetchActiveSessions, stopPolling]);

//   if (!showingCompleted && sessions.length === 0 && !loading) return null;
//   if (!showingCompleted && loading && sessions.length === 0) return null;

//   const showProgress = !!displaySession;

//   const headerTitle = isCompleted
//     ? "Baigta 🏁"
//     : isCreditCheck
//       ? "Tikrinami kreditai..."
//       : showProgress
//         ? "Apdorojami failai..."
//         : `Eilėje: ${queuedSessions.length} užduotys`;

//   const headerSub = showProgress && total
//     ? isCompleted
//       ? `${done + failed} / ${total} failų apdorota`
//       : `${processed} / ${total} failų`
//     : showProgress
//       ? "Vykdoma..."
//       : "";

//   const barVariant = isCreditCheck && !isCompleted ? "indeterminate" : "determinate";
//   const displayPercent = Math.round(uiPercent) || 0;
//   const barValue = barVariant === "determinate" ? Math.max(0, Math.min(100, displayPercent)) : undefined;

//   // Цвет header
//   const headerBgColor = isCompleted 
//     ? COMPLETED_GREEN
//     : showProgress 
//       ? "primary.main" 
//       : "grey.500";

//   return (
//     <Paper
//       elevation={3}
//       sx={{
//         position: "sticky",
//         top: 0,
//         zIndex: 1100,
//         mb: 2,
//         overflow: "visible",
//         borderRadius: 2,
//       }}
//     >
//       <Box
//         sx={{
//           display: "flex",
//           alignItems: "center",
//           justifyContent: "space-between",
//           px: 2,
//           py: 1.5,
//           bgcolor: headerBgColor,
//           color: "white",
//           cursor: "pointer",
//           borderTopLeftRadius: 8,
//           borderTopRightRadius: 8,
//           animation: showProgress && !isCompleted ? `${pulse} 2s ease-in-out infinite` : "none",
//         }}
//         onClick={() => setExpanded(!expanded)}
//       >
//         <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
//           {isCompleted ? (
//             <CheckCircle fontSize="small" />
//           ) : showProgress ? (
//             <HourglassEmpty
//               fontSize="small"
//               sx={{
//                 animation: "spin 2s linear infinite",
//                 "@keyframes spin": {
//                   "0%": { transform: "rotate(0deg)" },
//                   "100%": { transform: "rotate(360deg)" },
//                 },
//               }}
//             />
//           ) : (
//             <Queue fontSize="small" />
//           )}

//           <Box>
//             <Typography variant="body2" fontWeight={600}>
//               {headerTitle}
//             </Typography>
//             {showProgress && (
//               <Typography variant="caption" sx={{ opacity: 0.9 }}>
//                 {headerSub}
//               </Typography>
//             )}
//           </Box>
//         </Box>

//         <IconButton size="small" sx={{ color: "white" }}>
//           {expanded ? <ExpandLess /> : <ExpandMore />}
//         </IconButton>
//       </Box>

//       {showProgress && (
//         <Box sx={{ px: 2, pt: 1.5, pb: 1.5, bgcolor: "background.paper" }}>
//           <Box
//             sx={{
//               display: "flex",
//               justifyContent: "space-between",
//               alignItems: "center",
//               mb: 0.75,
//             }}
//           >
//             <Typography variant="body2" color="textSecondary" fontWeight={500}>
//               Progresas
//             </Typography>

//             <Chip
//               label={`${displayPercent}%`}
//               size="small"
//               color={isCompleted ? "success" : "primary"}
//               sx={{ fontWeight: 600, minWidth: 56 }}
//             />
//           </Box>

//           <FancyProgress 
//             variant={barVariant} 
//             value={barValue}
//             sx={{
//               [`& .${linearProgressClasses.bar}`]: {
//                 backgroundColor: isCompleted ? COMPLETED_GREEN : undefined,
//               },
//             }}
//           />

//           {/* Статистика под баром */}
//           <Box
//             sx={{
//               display: "flex",
//               justifyContent: "space-between",
//               alignItems: "center",
//               mt: 0.75,
//             }}
//           >
//             <Typography variant="caption" color="textSecondary">
//               {displaySession?.uploaded_files || 0} failų įkelta
//             </Typography>

//             {/* done + failed */}
//             <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
//               <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
//                 <CheckCircle
//                   sx={{
//                     fontSize: 14,
//                     color: done > 0 ? "success.main" : "text.disabled",
//                   }}
//                 />
//                 <Typography
//                   variant="caption"
//                   color={done > 0 ? "success.main" : "text.disabled"}
//                   fontWeight={600}
//                 >
//                   {done}
//                 </Typography>
//               </Box>

//               <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
//                 <Error
//                   sx={{
//                     fontSize: 14,
//                     color: failed > 0 ? "error.main" : "text.disabled",
//                   }}
//                 />
//                 <Typography
//                   variant="caption"
//                   color={failed > 0 ? "error.main" : "text.disabled"}
//                   fontWeight={600}
//                 >
//                   {failed}
//                 </Typography>
//               </Box>
//             </Box>
//           </Box>
//         </Box>
//       )}

//       <Collapse in={expanded}>
//         <Box sx={{ px: 2, pb: 2, pt: showProgress ? 0 : 2 }}>
//           {queuedSessions.length > 0 && !isCompleted && (
//             <Box
//               sx={{
//                 pt: showProgress ? 1 : 0,
//                 borderTop: showProgress ? "1px solid" : "none",
//                 borderColor: "divider",
//               }}
//             >
//               <Typography
//                 variant="body2"
//                 color="textSecondary"
//                 fontWeight={500}
//                 gutterBottom
//               >
//                 Eilėje laukia:
//               </Typography>

//               {queuedSessions.map((s, idx) => (
//                 <Box
//                   key={s.id}
//                   sx={{
//                     display: "flex",
//                     alignItems: "center",
//                     gap: 1,
//                     py: 0.5,
//                   }}
//                 >
//                   <Queue fontSize="small" color="action" />
//                   <Typography variant="body2">Užduotis #{idx + 1}</Typography>
//                   <Chip
//                     label={`${s.expected_items || s.uploaded_files || 0} failų`}
//                     size="small"
//                     variant="outlined"
//                   />
//                 </Box>
//               ))}
//             </Box>
//           )}
//         </Box>
//       </Collapse>
//     </Paper>
//   );
// }