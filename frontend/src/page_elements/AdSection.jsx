import { Box, Typography, Button, Stack } from "@mui/material";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import StarIcon from "@mui/icons-material/Star";
import { track } from "../metaPixel";

// helper: извлечь YouTube videoId из embed/watch/short urls
function getYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1].split("/")[0];
    const v = u.searchParams.get("v");
    if (v) return v;
  } catch {}
  return url; // fallback
}

/**
 * Рекламный блок c CTA и кнопкой просмотра видео.
 * Props:
 * - onOpenVideo: () => void — открыть внешний модал/диалог на странице
 * - videoUrl: string — YouTube URL (embed или обычный)
 * - videoTitle: string — имя для события ViewContent
 * - onLearnMoreClick?: () => void — опциональный обработчик клика "Sužinoti daugiau"
 */
export default function AdSection({
  onOpenVideo,
  videoUrl = "https://www.youtube.com/embed/falGn4_S_5Y?si=LFmb3RYZCG59JKF8",
  videoTitle = "DokSkenas demo",
  onLearnMoreClick,
}) {
  const sendViewContent = () => {
    if (!window.fbq) return;
    const id = getYoutubeId(videoUrl);
    track("ViewContent", {
      content_ids: [id],
      content_name: videoTitle,
      content_type: "video",
    });
  };

  const handleVideoClick = () => {
    // 1) событие в Meta Pixel
    sendViewContent();
    // 2) открыть внешний модал на странице
    if (onOpenVideo) onOpenVideo();
  };

  return (
    <Box
      sx={{
        mt: 4,
        p: 3,
        borderRadius: 2,
        backgroundColor: "#f2f2f2",
        border: "1px solid #3a3a3a",
      }}
    >
      <Stack direction="row" spacing={3} alignItems="center">
        {/* Левая часть: текст + список + кнопки */}
        <Box sx={{ flex: 1 }}>
          <Typography
            sx={{
              color: "#404040",
              fontSize: { xs: "22px", sm: "26px" },
              fontWeight: 700,
              mb: 1,
            }}
          >
            Gaištate krūvą laiko apskaitai? Automatizuokite apskaitą su DI!
          </Typography>

          <Box
            component="ol"
            sx={{
              pl: 3,
              m: 0,
              color: "#404040",
              fontFamily: "Helvetica",
              listStyleType: "decimal",
              "& > li": { mb: "6px" },
            }}
          >
            <li>Įkelkite sąskaitas į DokSkeną</li>
            <li>Palaukite, kol nuskaitys duomenis</li>
            <li>Įkelkite failus į savo buhalterinę programą (Rivilę, Finvaldą, Centą...)</li>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }}>
            <Button
              variant="contained"
              href="/saskaitu-skaitmenizavimas-dokskenas"
              onClick={onLearnMoreClick}
              sx={{
                borderRadius: 1,
                fontWeight: 300,
                color: "#1b1b1b",
                backgroundColor: "#f5be09",
              }}
            >
              Sužinoti daugiau
            </Button>

            <Button
              startIcon={<PlayCircleIcon />}
              variant="outlined"
              onClick={handleVideoClick}
              sx={{
                borderColor: "black",
                color: "black",
                "&:hover": { backgroundColor: "#fff6d8", color: "black" },
              }}
            >
              Žiūrėti video
            </Button>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={0.01} justifyContent="center">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} sx={{ color: "#f5cf54" }} />
              ))}
            </Stack>
            <Typography variant="body2">Daugiau nei 100 įmonių naudojasi DokSkenu kasdien</Typography>
          </Stack>
        </Box>

        {/* Правая часть: картинка (desktop) */}
        <Box
          component="img"
          src="/DokSkenas_square.jpg"
          alt="DokSkenas"
          sx={{
            display: { xs: "none", md: "block" },
            width: 180,
            height: "auto",
            borderRadius: 2,
            cursor: "pointer",
            "&:hover": { opacity: 0.9 },
          }}
          onClick={() => (window.location.href = "/saskaitu-skaitmenizavimas-dokskenas")}
        />
      </Stack>
    </Box>
  );
}
