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
  Divider,
} from "@mui/material";
import { Link as RouterLink, useParams } from "react-router-dom";

// ===== API base =====
const API_BASE = import.meta.env.VITE_BASE_API_URL
  .replace(/\/$/, "")
  .replace(/\/api$/, "");

// ===== fetch one article =====
async function getArticleBySlug(slug) {
  const res = await fetch(`${API_BASE}/guides-api/v2/guides/${slug}/`);
  if (!res.ok) return null;
  return res.json();
}

// ===== typography presets =====
const BLOG_FONT_FAMILY =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";

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

// ===== utils =====
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function toYouTubeEmbed(urlLike) {
  try {
    const url = new URL(urlLike);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : urlLike;
    }
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : urlLike;
      }
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/")[2];
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : urlLike;
      }
      if (url.pathname.startsWith("/embed/")) {
        return `https://www.youtube-nocookie.com${url.pathname}${url.search}`;
      }
    }
    return urlLike;
  } catch {
    return urlLike;
  }
}

export default function GidoArticle() {
  const { slug } = useParams();
  const [article, setArticle] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getArticleBySlug(slug);
        setArticle(data || null);
        if (data?.seo_title || data?.title) {
          document.title = data.seo_title || data.title;
        }
      } catch (e) {
        console.error("❌ Article fetch error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading)
    return (
      <Container sx={{ py: 10, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );

  if (!article)
    return (
      <Container sx={{ py: 10 }}>
        <Typography align="center" color="error" sx={{ fontFamily: BLOG_FONT_FAMILY }}>
          Straipsnis nerastas 😢
        </Typography>
      </Container>
    );

  const blocks = article.body || [];

  const headings = blocks
    .filter((b) => b.type === "heading" && b.value)
    .map((b) => ({ text: b.value, id: slugify(b.value) }));

  // ===== render one StreamField block =====
  const renderBlock = (block, i) => {
    const t = block.type;
    const v = block.value;

    switch (t) {
      case "heading":
        return (
          <Typography
            id={slugify(v)}
            key={block.id || i}
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

      case "paragraph":
        return (
          <Box
            key={block.id || i}
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
              "& a": {
                color: "primary.main",
                textDecoration: "underline",
                textUnderlineOffset: "0.15em",
                "&:hover": { textDecorationThickness: "2px" },
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
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
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
            key={block.id || i}
            component="img"
            src={v?.meta?.download_url}
            alt={v?.title || ""}
            sx={{ borderRadius: 2, my: 3 }}
            loading="lazy"
          />
        );

      case "youtube":
        return (
          <Box
            key={block.id || i}
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
              src={toYouTubeEmbed(v)}
              title="YouTube video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </Box>
        );

      case "code":
        return (
          <Box
            key={block.id || i}
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
                "ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace",
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
            key={block.id || i}
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

      case "divider":
        return <Divider key={block.id || i} sx={{ my: 4 }} />;

      default:
        return null;
    }
  };

  const published = article.first_published_at
    ? new Date(article.first_published_at).toLocaleDateString("lt-LT", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <Box sx={{ bgcolor: "background.default" }}>
      {/* hero image */}
      {article.main_image_url && (
        <Box sx={{ bgcolor: "grey.50", borderBottom: "1px solid", borderColor: "grey.200" }}>
          <Container maxWidth="lg">
            <CardMedia
              component="img"
              src={article.main_image_url}
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
        {/* breadcrumbs */}
        <Breadcrumbs sx={{ mb: 2, fontFamily: BLOG_FONT_FAMILY }}>
          <MuiLink component={RouterLink} to="/naudojimo-gidas" underline="hover" color="primary">
            Naudojimo gidas
          </MuiLink>
          <Typography color="text.primary">{article.title}</Typography>
        </Breadcrumbs>

        {/* header */}
        <Box sx={{ maxWidth: 860, mx: "auto", textAlign: "left" }}>
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

          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3, color: "text.secondary" }}>
            <Chip size="small" label={article.author_name || "—"} />
            <Box sx={{ width: 2, height: 2, bgcolor: "text.disabled", borderRadius: 1 }} />
            <Typography variant="body2">{published}</Typography>
          </Stack>
        </Box>

        {/* main content + TOC */}
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
          {/* body */}
          <Box sx={{ maxWidth: 860, mx: "auto" }}>
            {blocks.map((b, i) => renderBlock(b, i))}
          </Box>

          {/* TOC */}
          {headings.length > 0 && (
            <Box sx={{ display: { xs: "none", lg: "block" }, position: "sticky", top: 96 }}>
              <Box
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "grey.200",
                  borderRadius: 2,
                  bgcolor: "grey.50",
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Turinys
                </Typography>
                <Stack spacing={1}>
                  {headings.map((h) => (
                    <MuiLink
                      key={h.id}
                      href={`#${h.id}`}
                      underline="hover"
                      color="text.primary"
                      sx={{ fontSize: 14, lineHeight: 1.6, "&:hover": { color: "primary.main" } }}
                    >
                      {h.text}
                    </MuiLink>
                  ))}
                </Stack>
              </Box>
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
}

