import React from "react";
import {
  Box,
  Container,
  Typography,
  Breadcrumbs,
  Link as MuiLink,
  CardMedia,
  CircularProgress,
  Chip,
  Stack,
  Button,
  Divider,
} from "@mui/material";
import { Link as RouterLink, useParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_BASE_API_URL
  .replace(/\/$/, "")
  .replace(/\/api$/, "");

// --- БАЗОВЫЕ ПРЕСЕТЫ ТИПОГРАФИКИ ДЛЯ БЛОГА ---
const BLOG_FONT_FAMILY =
  "'Inter', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Apple Color Emoji', 'Segoe UI Emoji'";

const HEADING_COMMON = {
  fontFamily: BLOG_FONT_FAMILY,
  fontWeight: 800,
  letterSpacing: "-0.015em",
  lineHeight: 1.25,
};

const BODY_COMMON = {
  fontFamily: BLOG_FONT_FAMILY,
  fontWeight: 400,
  lineHeight: 1.8,
};

// --- API helpers ---
async function getArticleBySlug(slug) {
  const res = await fetch(
    `${API_BASE}/guides-api/v2/pages/?type=docscanner_app.GuidePage&slug=${encodeURIComponent(
      slug
    )}&fields=title,slug,body,main_image,author_name,first_published_at,last_published_at,seo_title,search_description`
  );
  const data = await res.json();
  return data.items?.[0] || null;
}

// --- utils ---
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Нормализация любых YouTube URL к embed + nocookie
function toYouTubeEmbed(urlLike) {
  try {
    const url = new URL(urlLike);
    const host = url.hostname.replace(/^www\./, "");

    // youtu.be/<id>
    if (host === "youtu.be") {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : urlLike;
    }

    // youtube.com / m.youtube.com / youtube-nocookie.com
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      // /watch?v=..., /shorts/<id>, /embed/<id>
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id
          ? `https://www.youtube-nocookie.com/embed/${id}`
          : urlLike;
      }
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/")[2];
        return id
          ? `https://www.youtube-nocookie.com/embed/${id}`
          : urlLike;
      }
      if (url.pathname.startsWith("/embed/")) {
        // уже embed — только переведём на nocookie-домен
        return `https://www.youtube-nocookie.com${url.pathname}${url.search}`;
      }
    }

    return urlLike; // не YouTube или не распознали — оставляем как есть
  } catch {
    return urlLike;
  }
}

export default function GidoArticle() {
  const { slug } = useParams();
  const [article, setArticle] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // загрузка статьи
  React.useEffect(() => {
    (async () => {
      try {
        const a = await getArticleBySlug(slug);
        setArticle(a || null);
        // SEO title
        if (a?.seo_title || a?.title) {
          document.title = a.seo_title || a.title;
        }
      } catch (e) {
        console.error("❌ Article fetch error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) {
    return (
      <Container sx={{ py: 10, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!article) {
    return (
      <Container sx={{ py: 10 }}>
        <Typography align="center" color="error" sx={{ fontFamily: BLOG_FONT_FAMILY }}>
          Straipsnis nerastas
        </Typography>
      </Container>
    );
  }

  // Собираем оглавление из heading-блоков
  const headings =
    article.body?.filter((b) => b.type === "heading" && b.value)?.map((b) => ({
      text: b.value,
      id: slugify(b.value),
    })) || [];

  // Рендер одного блока StreamField
  const renderBlock = (block, i) => {
    const t = block.type;
    const v = block.value;

    switch (t) {
      case "heading": {
        const id = slugify(v);
        return (
          <Typography
            id={id}
            key={i}
            variant="h4"
            component="h2"
            sx={{
              ...HEADING_COMMON,
              fontSize: { xs: 26, md: 30 },
              mt: { xs: 4, md: 5 },
              mb: 1.5,
              scrollMarginTop: 100,
            }}
          >
            {v}
          </Typography>
        );
      }

      case "paragraph":
        return (
          <Box
            key={i}
            sx={{
              ...BODY_COMMON,
              fontSize: { xs: 16, md: 17 },
              color: "text.primary",

              "& p": { m: 0, mb: 1.75 },
              "& strong": { fontWeight: 700 },
              "& em": { fontStyle: "italic" },

              "& img": {
                maxWidth: "100%",
                borderRadius: 2,
                my: 2.5,
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
              },

              "& h2, & h3, & h4, & h5": {
                ...HEADING_COMMON,
                mt: 5,
                mb: 2,
              },
              "& h2": { fontSize: { xs: 24, md: 28 } },
              "& h3": { fontSize: { xs: 22, md: 24 } },
              "& h4": { fontSize: { xs: 20, md: 22 } },

              "& ul, & ol": { pl: 3, my: 2 },
              "& li": { mb: 1 },
              "& li > ul, & li > ol": { mt: 1, mb: 1 },

              "& a": {
                color: "primary.main",
                textDecoration: "underline",
                textUnderlineOffset: "0.15em",
                "&:hover": { textDecorationThickness: "2px" },
                fontWeight: 500,
              },

              "& blockquote": {
                borderLeft: "4px solid",
                borderColor: "primary.main",
                pl: 2,
                my: 3,
                color: "text.secondary",
                fontStyle: "italic",
              },

              "& code": {
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: "0.95em",
                background: "rgba(0,0,0,0.04)",
                borderRadius: 1,
                px: 0.5,
                py: 0.2,
              },
            }}
            dangerouslySetInnerHTML={{ __html: v }}
          />
        );

      case "image":
        return (
          <CardMedia
            key={i}
            component="img"
            src={v?.meta?.download_url}
            alt={v?.title || ""}
            sx={{ borderRadius: 2, my: 3 }}
            loading="lazy"
          />
        );

      case "youtube": {
        const src = toYouTubeEmbed(v);
        return (
          <Box
            key={i}
            sx={{
              position: "relative",
              width: "100%",
              aspectRatio: "16/9",
              my: 3,
              borderRadius: 2,
              overflow: "hidden",
              boxShadow: 2,
            }}
          >
            <Box
              component="iframe"
              src={src}
              title="YouTube video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </Box>
        );
      }

      case "code":
        return (
          <Box
            key={i}
            component="pre"
            sx={{
              my: 3,
              p: 2,
              overflowX: "auto",
              borderRadius: 2,
              bgcolor: "grey.100",
              border: "1px solid",
              borderColor: "grey.200",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <code>{v}</code>
          </Box>
        );

      case "quote":
        return (
          <Box
            key={i}
            sx={{
              borderLeft: "4px solid",
              borderColor: "primary.main",
              pl: 2,
              py: 1,
              my: 3,
              color: "text.secondary",
              fontStyle: "italic",
              ...BODY_COMMON,
              fontSize: { xs: 16, md: 17 },
            }}
          >
            {v}
          </Box>
        );

      case "table": {
        const rows =
          v?.data?.map?.((r) => r.value) ||
          v?.data?.stream?.map?.((r) => r.value) ||
          [];
        return (
          <Box key={i} sx={{ my: 3, overflowX: "auto" }}>
            {v?.caption ? (
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 1, fontFamily: BLOG_FONT_FAMILY, letterSpacing: "0.02em" }}
              >
                {v.caption}
              </Typography>
            ) : null}
            <Box
              component="table"
              sx={{
                borderCollapse: "separate",
                borderSpacing: 0,
                width: "100%",
                fontFamily: BLOG_FONT_FAMILY,
                "& td, & th": {
                  border: "1px solid #e5e7eb",
                  padding: "10px 14px",
                  verticalAlign: "top",
                  fontSize: 14.5,
                  lineHeight: 1.6,
                },
                "& th": { fontWeight: 700, backgroundColor: "#f9fafb" },
                "& tr:nth-of-type(even) td": { backgroundColor: "#fafafa" },
              }}
            >
              <tbody>
                {rows.map((cells, ri) => (
                  <tr key={ri}>
                    {cells.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        );
      }

      case "divider":
        return <Divider key={i} sx={{ my: 4 }} />;

      case "spacer":
        return <Box key={i} sx={{ height: (v || 40) + "px" }} />;

      case "button":
        return (
          <Box key={i} sx={{ my: 2 }}>
            <Button
              href={v?.url}
              target="_blank"
              variant="contained"
              sx={{
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 600,
                fontFamily: BLOG_FONT_FAMILY,
                px: 1.75,
                py: 1,
              }}
            >
              {v?.label || "Button"}
            </Button>
          </Box>
        );

      case "html":
        return (
          <Box
            key={i}
            dangerouslySetInnerHTML={{ __html: v }}
            sx={{ my: 2, fontFamily: BLOG_FONT_FAMILY, fontSize: { xs: 16, md: 17 }, lineHeight: 1.8 }}
          />
        );

      default:
        return null;
    }
  };

  const published = article.first_published_at
    ? new Date(article.first_published_at).toLocaleDateString()
    : "";

  return (
    <Box sx={{ bgcolor: "background.default" }}>
      {/* hero изображение (если есть) */}
      {article.main_image?.meta?.download_url && (
        <Box sx={{ bgcolor: "grey.50", borderBottom: "1px solid", borderColor: "grey.200" }}>
          <Container maxWidth="lg">
            <CardMedia
              component="img"
              src={article.main_image.meta.download_url}
              alt={article.title}
              sx={{
                maxHeight: 520,
                width: "100%",
                objectFit: "cover",
                borderRadius: 2,
                my: { xs: 2, md: 3 },
              }}
              loading="lazy"
            />
          </Container>
        </Box>
      )}

      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
        {/* Breadcrumbs */}
        <Breadcrumbs sx={{ mb: 2, fontFamily: BLOG_FONT_FAMILY }}>
          <MuiLink
            component={RouterLink}
            to="/naudojimo-gidas"
            underline="hover"
            color="primary"
            sx={{ fontFamily: BLOG_FONT_FAMILY }}
          >
            Naudojimo gidas
          </MuiLink>
          <Typography color="text.primary" sx={{ fontFamily: BLOG_FONT_FAMILY }}>
            {article.title}
          </Typography>
        </Breadcrumbs>

        {/* Шапка статьи */}
        <Box
          sx={{
            maxWidth: 860,
            mx: "auto",
            textAlign: "left",
          }}
        >
          <Typography
            variant="h3"
            component="h1"
            sx={{
              ...HEADING_COMMON,
              fontSize: { xs: 30, md: 36 },
              mb: 1,
            }}
          >
            {article.title}
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ mb: 3, color: "text.secondary", fontFamily: BLOG_FONT_FAMILY }}
          >
            <Chip size="small" label={article.author_name || "—"} sx={{ fontFamily: BLOG_FONT_FAMILY }} />
            <Box sx={{ width: 2, height: 2, bgcolor: "text.disabled", borderRadius: 1 }} />
            <Typography variant="body2" sx={{ fontFamily: BLOG_FONT_FAMILY, letterSpacing: "0.01em" }}>
              {published}
            </Typography>
          </Stack>
        </Box>

        {/* Контент + оглавление */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0,860px) 240px" },
            gap: { xs: 0, lg: 6 },
            alignItems: "start",
            maxWidth: { xs: "100%", lg: "min(1200px, 100%)" },
            mx: "auto",
            fontFamily: BLOG_FONT_FAMILY,
          }}
        >
          {/* Основной контент */}
          <Box sx={{ maxWidth: 860, mx: "auto" }}>
            {article.body?.map((b, i) => renderBlock(b, i))}
          </Box>

          {/* TOC — на десктопе справа */}
          <Box
            sx={{
              display: { xs: "none", lg: "block" },
              position: "sticky",
              top: 96,
            }}
          >
            {headings.length > 0 && (
              <Box
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "grey.200",
                  borderRadius: 2,
                  bgcolor: "grey.50",
                  fontFamily: BLOG_FONT_FAMILY,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, letterSpacing: "0.02em" }}>
                  Turinys
                </Typography>
                <Stack spacing={1}>
                  {headings.map((h) => (
                    <MuiLink
                      key={h.id}
                      href={`#${h.id}`}
                      underline="hover"
                      color="text.primary"
                      sx={{
                        fontSize: 14,
                        lineHeight: 1.6,
                        "&:hover": { color: "primary.main" },
                      }}
                    >
                      {h.text}
                    </MuiLink>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
