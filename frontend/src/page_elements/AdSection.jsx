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
 */
export default function AdSection({
  onOpenVideo,
  videoUrl = "https://www.youtube.com/embed/ByViuilYxZA",
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
    sendViewContent();
    if (onOpenVideo) onOpenVideo();
  };

  return (
    <Box
      sx={{
        mt: 4,
        borderRadius: 2,
        backgroundColor: "#f2f2f2",
        border: "1px solid #3a3a3a",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        {/* Левая часть: весь контент */}
        <Box
          sx={{
            flex: 1,
            p: 3,
            display: "flex",
            flexDirection: "column",
            order: { xs: 1, md: 1 },
          }}
        >
          {/* Title */}
          <Typography
            sx={{
              color: "#404040",
              fontSize: { xs: "20px", sm: "24px" },
              fontWeight: 700,
              mb: 1,
              order: 1,
            }}
          >
            Skęstate apskaitoje? Skaitmenizuokite sąskaitas su DokSkenu!
          </Typography>

          {/* Картинка на мобильном - между title и списком */}
          <Box
            component="img"
            src="/doskenas_apskaita.jpg"
            alt="DokSkenas - sąskaitų skaitmenizavimas"
            onClick={() => (window.location.href = "/saskaitu-skaitmenizavimas-dokskenas")}
            sx={{
              display: { xs: "block", md: "none" },
              width: "calc(100% + 48px)", // растягиваем на всю ширину, компенсируя padding родителя
              maxWidth: "none",
              height: "auto",
              my: 2,
              mx: -3, // отрицательный margin чтобы убрать padding по краям
              cursor: "pointer",
              order: 2,
            }}
          />

          {/* Список */}
          <Box
            component="ol"
            sx={{
              pl: 3,
              m: 0,
              color: "#404040",
              fontFamily: "Helvetica",
              listStyleType: "decimal",
              "& > li": { mb: "6px" },
              order: 3,
            }}
          >
            <li>Įkelkite sąskaitas į DokSkeną</li>
            <li>Palaukite, kol nuskaitys duomenis</li>
            <li>Įkelkite failus į savo buhalterinę programą (Rivilę, Finvaldą, Centą...)</li>
          </Box>

          {/* Кнопки */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ mt: 2, order: 4 }}
          >
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

          {/* Звёзды и текст */}
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mt: 2, order: 5 }}
          >
            <Stack direction="row" spacing={0.01} justifyContent="center">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} sx={{ color: "#f5cf54" }} />
              ))}
            </Stack>
            <Typography variant="body2">
              Daugiau nei 250 įmonių naudojasi DokSkenu kasdien
            </Typography>
          </Stack>
        </Box>

        {/* Правая часть: картинка на десктопе - на всю высоту без padding */}
        <Box
          sx={{
            display: { xs: "none", md: "block" },
            width: { md: "45%" },
            maxWidth: 450,
            flexShrink: 0,
            order: { xs: 2, md: 2 },
          }}
        >
          <Box
            component="img"
            src="/doskenas_apskaita.jpg"
            alt="DokSkenas - sąskaitų skaitmenizavimas"
            onClick={() => (window.location.href = "/saskaitu-skaitmenizavimas-dokskenas")}
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              cursor: "pointer",
              "&:hover": { opacity: 0.95 },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}