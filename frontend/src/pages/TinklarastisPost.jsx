import * as React from "react";
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
  Snackbar,
  Alert,
} from "@mui/material";
import { Link as RouterLink, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import DownloadIcon from "@mui/icons-material/Download";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";
import LinkIcon from "@mui/icons-material/Link";
import PowerOutlinedIcon from "@mui/icons-material/Power";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import "../styles/DownloadButton.css";

// ===== API base =====
const API_BASE =
  typeof window !== "undefined" && window.__PRERENDER
    ? "" // при пререндере — относительные URL (same-origin через прокси)
    : (import.meta.env.VITE_BASE_API_URL || "")
        .replace(/\/$/, "")
        .replace(/\/api$/, "");
// const API_BASE = import.meta.env.VITE_BASE_API_URL
//   .replace(/\/$/, "")
//   .replace(/\/api$/, "");

// ===== fetch one article =====
async function getArticleBySlug(slug) {
  const res = await fetch(`${API_BASE}/blog-api/v2/posts/${slug}/`);
  if (!res.ok) return null;
  return res.json();
}

// ===== typography =====
const BLOG_FONT_FAMILY =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
const HELV = "Helvetica, Arial, sans-serif";

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

// ===== nofollow для внешних ссылок (свои домены остаются dofollow) =====
const FOLLOW_DOMAINS = ["dokskenas.lt", "dokskenas", "atlyginimoskaiciuokle.com"];

// ===== CTA баннера =====
const PROMO_URL = "https://atlyginimoskaiciuokle.com/saskaitu-skaitmenizavimas-dokskenas";

function uniqueId(base, seen) {
  const b = base || "section";
  let id = b;
  let n = 2;
  while (seen.has(id)) id = `${b}-${n++}`;
  seen.add(id);
  return id;
}

function processParagraphHtml(html, seen) {
  if (!html) return { html, headings: [] };

  const headings = [];

  const out = html.replace(
    /<(h2|h3)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (m, tag, attrs, inner) => {
      const text = inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (!text) return m;
      const id = uniqueId(slugify(text), seen);
      headings.push({ text, id, level: tag.toLowerCase() });
      const cleaned = attrs.replace(/\sid=["'][^"']*["']/i, "").replace(/\sstyle=["'][^"']*["']/i, "");
      return `<${tag}${cleaned} id="${id}" style="scroll-margin-top:100px">${inner}</${tag}>`;
    }
  );

  const withRels = out.replace(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (m, pre, href, post) => {
    if (href.startsWith("/") || href.startsWith("#")) return m;
    let host = "";
    try {
      host = new URL(href, "https://atlyginimoskaiciuokle.com").hostname;
    } catch {}
    const isOwn = FOLLOW_DOMAINS.some((d) => host.includes(d));
    if (isOwn) return m;
    const rest = (pre + post).replace(/\srel=["'][^"']*["']/i, "").replace(/\starget=["'][^"']*["']/i, "");
    return `<a${rest} href="${href}" rel="nofollow noopener noreferrer" target="_blank">`;
  });

  return { html: withRels, headings };
}

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

function formatLt(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("lt-LT", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// ===== schema.org helpers =====
function extractText(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}

function youtubeIdFromUrl(urlLike) {
  try {
    const u = new URL(urlLike);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1);
    if (host.includes("youtube")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v") || "";
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || "";
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || "";
    }
  } catch {}
  return "";
}

function collectImagesFromBlocks(blocks) {
  const imgs = [];
  (blocks || []).forEach((b) => {
    if (b.type === "image") {
      const u = b?.value?.meta?.download_url;
      if (u) imgs.push(u);
    }
    if (b.type === "paragraph") {
      const html = b.value || "";
      const matches = [...html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)];
      matches.forEach((m) => imgs.push(m[1]));
    }
  });
  return Array.from(new Set(imgs));
}

function buildVideoFromBlocks(blocks) {
  const yt = (blocks || []).find((b) => b.type === "youtube")?.value;
  const id = yt ? youtubeIdFromUrl(yt) : "";
  if (!id) return null;
  return {
    embedUrl: `https://www.youtube.com/embed/${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    name: undefined,
    description: undefined,
  };
}

function buildBreadcrumbLD({ origin, categorySlug, categoryTitle, articleTitle }) {
  const items = [{ name: "Tinklaraštis", url: `${origin}/tinklarastis` }];
  if (categorySlug && categoryTitle) {
    items.push({ name: categoryTitle, url: `${origin}/tinklarastis/tema/${categorySlug}` });
  }
  items.push({ name: articleTitle, url: `${origin}${window.location.pathname}` });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${origin}${window.location.pathname}#breadcrumb`,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

function buildArticleLD({ origin, article, categoryTitle, images, video, lang = "lt-LT" }) {
  const url = `${origin}/tinklarastis/${article.slug}`;
  const headline = article.seo_title || article.title;
  const description =
    article.search_description ||
    extractText((article.body || []).find((b) => b.type === "paragraph")?.value || "").slice(0, 240);

  const imgList =
    images && images.length ? images : article.main_image_url ? [article.main_image_url] : [];

  const obj = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline,
    name: article.title,
    inLanguage: lang,
    articleSection: categoryTitle || undefined,
    description: description || undefined,
    image: imgList,
    author: article.author_name
      ? { "@type": "Person", name: article.author_name, url: `${origin}/apie-mus` }
      : undefined,
    publisher: {
      "@type": "Organization",
      name: "DokSkenas",
      logo: { "@type": "ImageObject", url: `${origin}/DokSkenas_logo.jpg` },
    },
    datePublished: article.first_published_at || undefined,
    dateModified: article.last_published_at || article.first_published_at || undefined,
    url,
  };

  if (video?.embedUrl) {
    obj.video = {
      "@type": "VideoObject",
      name: video.name || headline,
      description: video.description || description,
      uploadDate: article.last_published_at || article.first_published_at || undefined,
      thumbnailUrl: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
      embedUrl: video.embedUrl,
    };
  }

  return obj;
}

function DownloadButton({ label, fileUrl }) {
  const [open, setOpen] = React.useState(false);

  const handleClick = () => {
    if (fileUrl) setOpen(true);
  };

  return (
    <>
      <Box
        sx={{
          my: { xs: 3, md: 4 },
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Box
          component="a"
          href={fileUrl || "#"}
          download
          onClick={handleClick}
          className="dl-button"
          sx={{ width: "auto !important", display: "inline-block", flex: "0 0 auto", alignSelf: "center" }}
        >
          <span className="dl-button-outer">
            <span className="dl-button-inner">
              <span className="dl-button-label">
                <DownloadIcon className="dl-button-icon" />
                {label || "Atsisiųsti"}
              </span>
            </span>
          </span>
        </Box>
      </Box>

      <Snackbar
        open={open}
        autoHideDuration={2500}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          icon={<DownloadIcon fontSize="inherit" />}
          variant="filled"
          onClose={() => setOpen(false)}
          sx={{ fontFamily: HELV, fontWeight: 600, borderRadius: 2, alignItems: "center", bgcolor: "#1D6F42", color: "#fff" }}
        >
          Siunčiama…
        </Alert>
      </Snackbar>
    </>
  );
}

function DokSkenasPromo({ mobile = false, sticky = false }) {
  const items = [
    { icon: <AccessTimeIcon sx={{ fontSize: 17, color: "#7fe0a8", flexShrink: 0 }} />, text: "nuskaito per 30s" },
    { icon: <CalculateOutlinedIcon sx={{ fontSize: 17, color: "#7fe0a8", flexShrink: 0 }} />, text: "sumiškai arba kiekybiškai" },
    { icon: <LinkIcon sx={{ fontSize: 17, color: "#7fe0a8", flexShrink: 0 }} />, text: "susieja eilutes su tavo prekių katalogu" },
    { icon: <PowerOutlinedIcon sx={{ fontSize: 17, color: "#7fe0a8", flexShrink: 0 }} />, text: "integruojasi su tavo apskaitos programa" },
  ];

  return (
    <Box
      sx={{
        display: mobile ? { xs: "block", lg: "none" } : { xs: "none", lg: "block" },
        my: mobile ? 4 : 0,
        ...(sticky && { position: "sticky", top: 96 }),
      }}
    >
      <Box
        sx={{
          borderRadius: "12px",
          p: "22px",
          background: "linear-gradient(160deg, #1D6F42 0%, #14522F 100%)",
          color: "#fff",
        }}
      >
        <Typography sx={{ fontFamily: HELV, fontWeight: 500, fontSize: 19, lineHeight: 1.3, mb: 0.5 }}>
          Vargsti su apskaita?
        </Typography>
        <Typography sx={{ fontSize: 14, lineHeight: 1.45, mb: 2, color: "#d3f0df" }}>
          Skaitmenizuok bei išrašyk sąskaitas su DokSkenu
        </Typography>

        <Stack spacing={1.1} sx={{ mb: 2.25 }}>
          {items.map((it, i) => (
            <Box key={i} sx={{ display: "flex", gap: 1.1, fontSize: 13.5, lineHeight: 1.35, alignItems: "flex-start" }}>
              {it.icon}
              <span>{it.text}</span>
            </Box>
          ))}
        </Stack>

        <Box
          component="a"
          href={PROMO_URL}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.75,
            py: 1.25,
            borderRadius: 2,
            bgcolor: "#fff",
            color: "#145232",
            fontFamily: HELV,
            fontWeight: 500,
            fontSize: 14,
            textDecoration: "none",
            transition: "transform .15s ease, box-shadow .15s ease",
            "&:hover": { transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
          }}
        >
          Sužinoti daugiau <ArrowForwardIcon sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
}

export default function TinklarastisPost() {
  const { slug } = useParams();
  const [article, setArticle] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getArticleBySlug(slug);
        setArticle(data || null);
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

  const seenIds = new Set();
  const toc = [];
  const htmlByBlock = {};
  const headingIdByBlock = {};
  blocks.forEach((b, i) => {
    const key = b.id || i;
    if (b.type === "heading" && b.value) {
      const id = uniqueId(slugify(b.value), seenIds);
      headingIdByBlock[key] = id;
      toc.push({ text: b.value, id, level: "h2" });
    } else if (b.type === "paragraph") {
      const { html, headings } = processParagraphHtml(b.value, seenIds);
      htmlByBlock[key] = html;
      headings.forEach((h) => toc.push(h));
    }
  });

  // нумерация: h2 → 1,2,3; h3 → 1.1, 1.2
  let h2n = 0;
  let h3n = 0;
  toc.forEach((h) => {
    if (h.level === "h3") {
      h3n += 1;
      h.num = `${h2n}.${h3n}`;
    } else {
      h2n += 1;
      h3n = 0;
      h.num = `${h2n}`;
    }
  });

  let mobileBannerIndex = blocks.findIndex(
    (b) =>
      (b.type === "heading" && b.value) ||
      (b.type === "paragraph" && /<h2[\s>]/i.test(b.value || ""))
  );
  if (mobileBannerIndex === -1) mobileBannerIndex = Math.min(1, blocks.length);

  // Из бэка: category_slug / category_title
  const catSlug = article.category_slug || "";
  const catTitle = article.category_title || "";

  // Дата: last_published_at -> first_published_at
  const published = formatLt(article.last_published_at || article.first_published_at);

  // ===== JSON-LD objects =====
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const imagesFromBody = collectImagesFromBlocks(blocks);
  const videoFromBody = buildVideoFromBlocks(blocks);
  const ldBreadcrumbs = buildBreadcrumbLD({
    origin,
    categorySlug: catSlug,
    categoryTitle: catTitle,
    articleTitle: article.title,
  });
  const ldArticle = buildArticleLD({
    origin,
    article,
    categoryTitle: catTitle,
    images: imagesFromBody,
    video: videoFromBody,
    lang: "lt-LT",
  });
  const ldWebPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${origin}${window.location.pathname}#webpage`,
    url: `${origin}${window.location.pathname}`,
    name: article.seo_title || article.title,
    description: article.search_description || undefined,
    inLanguage: "lt-LT",
    breadcrumb: { "@id": `${origin}${window.location.pathname}#breadcrumb` },
  };

  // ===== render one StreamField block =====
  const renderBlock = (block, i) => {
    const t = block.type;
    const v = block.value;

    switch (t) {
      case "heading":
        return (
          <Typography
            id={headingIdByBlock[block.id || i]}
            key={block.id || i}
            variant="h4"
            component="h2"
            sx={{
              ...HEADING_COMMON,
              fontSize: { xs: 26, md: 30 },
              lineHeight: 1.5,
              mt: { xs: 6, md: 8 },
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
              fontSize: { xs: 17, md: 17 },
              color: "text.primary",
              "& p": { m: 0, mb: 1.75 },
              "& h2": {
                ...HEADING_COMMON,
                lineHeight: 1.5,
                fontSize: { xs: 24, md: 28 },
                mt: { xs: 6, md: 8 },
                mb: 1.5,
              },
              "& h3": {
                ...HEADING_COMMON,
                lineHeight: 1.5,
                fontSize: { xs: 21, md: 24 },
                mt: { xs: 5, md: 7 },
                mb: 1.25,
              },
              "& h4, & h5, & h6": {
                ...HEADING_COMMON,
                lineHeight: 1.5,
                fontSize: { xs: 18, md: 20 },
                mt: { xs: 4, md: 6 },
                mb: 1,
              },
              "& ul, & ol": { pl: 4, my: 2 },
              "& li": { mb: 0.75, pl: 0.5, lineHeight: 1.7 },
              "& li > p": { m: 0 },
              "& strong": { fontWeight: 700 },
              "& em": { fontStyle: "italic" },
              "& img": {
                maxWidth: "100%",
                height: "auto",  
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
            dangerouslySetInnerHTML={{ __html: htmlByBlock[block.id || i] ?? v }}
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
              fontSize: { xs: 17, md: 17 },
            }}
          >
            {v}
          </Box>
        );

      case "download_button":
        return <DownloadButton key={block.id || i} label={v?.label} fileUrl={v?.file_url} />;

      case "divider":
        return <Divider key={block.id || i} sx={{ my: 4 }} />;

      default:
        return null;
    }
  };

  return (
    <Box sx={{ bgcolor: "background.default" }}>
      <Helmet>
        <title>{article.seo_title || article.title}</title>
        <meta name="description" content={article.search_description || ""} />
        <link rel="canonical" href={`${origin}/tinklarastis/${article.slug}`} />

        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={article.seo_title || article.title} />
        <meta property="og:description" content={article.search_description || ""} />
        <meta property="og:url" content={`${origin}/tinklarastis/${article.slug}`} />
        {article.main_image_url && (
          <meta property="og:image" content={article.main_image_url} />
        )}
        <meta property="og:site_name" content="DokSkenas" />
        <meta property="article:published_time" content={article.first_published_at || ""} />
        <meta property="article:modified_time" content={article.last_published_at || article.first_published_at || ""} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.seo_title || article.title} />
        <meta name="twitter:description" content={article.search_description || ""} />
        {article.main_image_url && (
          <meta name="twitter:image" content={article.main_image_url} />
        )}
      </Helmet>

      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
        {/* JSON-LD schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldBreadcrumbs) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldArticle) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldWebPage) }}
        />

        {/* Breadcrumbs: Helvetica, единый размер/высота */}
        <Breadcrumbs
          sx={{
            mb: 2,
            "& .MuiBreadcrumbs-ol": { alignItems: "center" },
            "& a, & p, & span": {
              fontFamily: HELV,
              fontSize: "0.8rem",
              lineHeight: 1.2,
              display: "inline-flex",
              alignItems: "center",
            },
          }}
        >
          <MuiLink component={RouterLink} to="/tinklarastis" underline="hover" color="primary">
            Tinklaraštis
          </MuiLink>

          {catSlug && catTitle ? (
            <MuiLink
              component={RouterLink}
              to={`/tinklarastis/tema/${catSlug}`}
              underline="hover"
              color="primary"
            >
              {catTitle}
            </MuiLink>
          ) : null}

          <Typography color="text.primary">{article.title}</Typography>
        </Breadcrumbs>

        {/* layout: левый столбец = title + meta + content; правый = TOC */}
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
          {/* левый: всё слева */}
          <Box sx={{ maxWidth: 860 }}>
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
              sx={{ mb: 7, color: "text.secondary" }}
            >
              <Chip size="small" label={article.author_name || "—"} />
              <Box sx={{ width: 2, height: 2, bgcolor: "text.disabled", borderRadius: 1 }} />
              <Typography variant="body2">{published}</Typography>
            </Stack>

            {blocks.map((b, i) => (
              <React.Fragment key={b.id || i}>
                {i === mobileBannerIndex && <DokSkenasPromo mobile />}
                {renderBlock(b, i)}
              </React.Fragment>
            ))}
          </Box>

          {/* правая колонка: TOC уходит со скроллом, баннер липнет.
              alignSelf:stretch растягивает колонку на всю высоту статьи —
              иначе sticky некуда ехать (колонка была высотой только TOC+баннер) */}
          <Box sx={{ display: { xs: "none", lg: "block" }, alignSelf: "stretch" }}>
            {toc.length > 0 && (
              <Box
                sx={{
                  p: 2,
                  mb: 2,
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
                  {toc.map((h) => (
                    <MuiLink
                      key={h.id}
                      href={`#${h.id}`}
                      underline="hover"
                      color="text.primary"
                      sx={{
                        display: "flex",
                        gap: 0.75,
                        fontSize: 14,
                        lineHeight: 1.6,
                        pl: h.level === "h3" ? 2 : 0,
                        "&:hover": { color: "primary.main" },
                      }}
                    >
                      <Box
                        component="span"
                        sx={{ color: "text.secondary", flexShrink: 0, minWidth: h.level === "h3" ? 24 : 14 }}
                      >
                        {h.num}
                      </Box>
                      <Box component="span">{h.text}</Box>
                    </MuiLink>
                  ))}
                </Stack>
              </Box>
            )}

            <DokSkenasPromo sticky />
          </Box>
        </Box>
      </Container>
    </Box>
  );
}