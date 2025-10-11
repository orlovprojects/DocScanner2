import * as React from "react";
import {
  Box,
  Container,
  Typography,
  Card,
  CardActionArea,
  CardMedia,
  CardContent,
  Button,
  Stack,
  Breadcrumbs,
  CircularProgress,
  Grid2,
  TextField,
  Link as MuiLink,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { Link as RouterLink, useParams } from "react-router-dom";

const API_ORIGIN = (() => {
  try {
    return new URL(import.meta.env.VITE_BASE_API_URL, window.location.href).origin;
  } catch {
    return "";
  }
})();

async function getCategoryWithArticles(slug) {
  const res = await fetch(`${API_ORIGIN}/guides-api/v2/guide-categories/${slug}/`);
  if (!res.ok) return null;
  return res.json();
}

export default function GidoCategoryPage() {
  const { slug } = useParams();

  const [category, setCategory] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // === Поиск ===
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(-1);
  const reqIdRef = React.useRef(0);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getCategoryWithArticles(slug);
        setCategory(data);
      } catch (e) {
        console.error("❌ Error fetching category:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  // === Backend search identical to naudojimo-gidas ===
  React.useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setHighlight(-1);
      return;
    }

    const currentId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const url = `${API_ORIGIN}/guides-api/v2/search/?q=${encodeURIComponent(
          query.trim()
        )}&limit=5&category=${slug}`;

        const resp = await fetch(url, { method: "GET", credentials: "include" });
        if (currentId !== reqIdRef.current) return;

        if (!resp.ok) {
          console.error("Search request failed", resp.status);
          setResults([]);
          setOpen(false);
          setHighlight(-1);
          return;
        }

        const data = await resp.json();
        const list = Array.isArray(data?.results) ? data.results : [];
        setResults(list);
        setOpen(list.length > 0);
        setHighlight(list.length ? 0 : -1);
      } catch (e) {
        if (currentId !== reqIdRef.current) return;
        console.error("Search error", e);
        setResults([]);
        setOpen(false);
        setHighlight(-1);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [query, slug]);

  // === Клавиатурная навигация ===
  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[highlight] ?? results[0];
      if (item) {
        const href =
          item.type === "category"
            ? item.href
            : (item.href || "").replace(/^\/gidas\//, "/straipsnis/");
        if (href) window.location.href = href;
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // helper для ссылок
  const resultHref = (r) =>
    r.type === "category"
      ? r.href || "#"
      : (r.href || "#").replace(/^\/gidas\//, "/straipsnis/");

  if (loading)
    return (
      <Container sx={{ py: 10, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );

  if (!category)
    return (
      <Container sx={{ py: 10, textAlign: "center" }}>
        <Typography color="error">Kategorija nerasta 😢</Typography>
      </Container>
    );

  const articles = category.articles || [];

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
      {/* Breadcrumbs */}
      <Breadcrumbs
        sx={{
          mb: 2,
          "& .MuiBreadcrumbs-ol": { alignItems: "center" },
          "& a, & p, & span": {
            fontFamily: "Helvetica, Arial, sans-serif",
            fontSize: "0.8rem",
            lineHeight: 1.2,
            display: "inline-flex",
            alignItems: "center",
          },
        }}
      >
        <MuiLink component={RouterLink} to="/naudojimo-gidas" underline="hover" color="primary">
          Naudojimo gidas
        </MuiLink>

        <Typography color="text.primary">{category.title}</Typography>
      </Breadcrumbs>

      {/* Title */}
      <Typography variant="h3" component="h1" fontWeight={800} sx={{ mb: 3 }}>
        {category.title}
      </Typography>

      {/* Description */}
      {category.description && (
        <Typography
          variant="body1"
          sx={{ mb: 4, color: "text.secondary" }}
          dangerouslySetInnerHTML={{ __html: category.description }}
        />
      )}

      {/* === Search (identical to naudojimo-gidas) === */}
      <Box sx={{ position: "relative", mb: 6, maxWidth: 520 }}>
        <TextField
          name="custom_search_field"
          placeholder="Ieškoti gidų..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(results.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          fullWidth
          autoComplete="off"
          slotProps={{
            input: {
              autoComplete: "off",
              "aria-autocomplete": "none",
            },
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              pl: 6,
              borderRadius: 3,
              backgroundColor: "#ffffff",
            },
          }}
        />

        <SearchIcon
          sx={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: "text.secondary",
          }}
        />

        {open && results.length > 0 && (
          <Box
            sx={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              mt: 1,
              zIndex: 10,
              backgroundColor: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 2,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}
            onMouseLeave={() => setHighlight(-1)}
          >
            {results.map((r, idx) => (
              <Box
                key={`${r.type}-${r.id}`}
                component="a"
                href={resultHref(r)}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setHighlight(idx)}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  textDecoration: "none",
                  color: "inherit",
                  px: 2,
                  py: 1.5,
                  gap: 1.5,
                  backgroundColor:
                    idx === highlight ? "action.hover" : "transparent",
                  "&:hover": { backgroundColor: "action.hover" },
                }}
              >
                <Box
                  sx={{
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontWeight: 300,
                    fontSize: 10,
                    opacity: 0.7,
                    minWidth: 72,
                    textTransform: "uppercase",
                    pt: "2px",
                  }}
                >
                  {r.type === "category" ? "Kategorija" : "Straipsnis"}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    sx={{
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      lineHeight: 1.35,
                    }}
                  >
                    {r.title}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* === Articles grid === */}
      <Grid2 container spacing={3}>
        {articles.length === 0 ? (
          <Grid2 xs={12}>
            <Box
              sx={{
                p: 4,
                borderRadius: 3,
                bgcolor: "background.default",
                textAlign: "center",
                color: "text.secondary",
              }}
            >
              Straipsnių šioje kategorijoje kol kas nėra.
            </Box>
          </Grid2>
        ) : (
          articles.map((p) => (
            <Grid2 key={p.id} xs={12} md={4}>
              <Card
                elevation={3}
                sx={{
                  height: "100%",
                  borderRadius: 3,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform .25s ease, box-shadow .25s ease",
                  "&:hover": { transform: "translateY(-4px)", boxShadow: 8 },
                }}
              >
                <CardActionArea
                  component={RouterLink}
                  to={`/straipsnis/${p.slug}`}
                  sx={{ alignSelf: "stretch" }}
                >
                  <Box sx={{ overflow: "hidden" }}>
                    <CardMedia
                      component="img"
                      image={p.main_image_url || "/images/placeholder.jpg"}
                      alt={p.title}
                      sx={{
                        height: { xs: 180, sm: 200 },
                        width: "100%",
                        objectFit: "cover",
                        transform: "scale(1)",
                        transition: "transform .35s ease",
                        "&:hover": { transform: "scale(1.03)" },
                      }}
                    />
                  </Box>

                  <CardContent sx={{ pb: 3 }}>
                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      sx={{ color: "text.secondary", mb: 1 }}
                    >
                      <Typography variant="body2">
                        {p.author_name || "—"}
                      </Typography>
                      <Box
                        sx={{
                          width: 2,
                          height: 2,
                          bgcolor: "text.disabled",
                          borderRadius: 1,
                        }}
                      />
                      <Typography variant="body2">
                        {(p.last_published_at || p.first_published_at)
                          ? new Date(
                              p.last_published_at || p.first_published_at
                            ).toLocaleDateString("lt-LT", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "—"}
                      </Typography>
                    </Stack>

                    <Typography
                      variant="h6"
                      fontWeight={700}
                      sx={{
                        mb: 2,
                        lineHeight: 1.25,
                        transition: "color .2s ease",
                        "&:hover": { color: "primary.main" },
                      }}
                    >
                      {p.title}
                    </Typography>

                    <Button
                      variant="contained"
                      size="small"
                      sx={{
                        backgroundColor: "black",
                        color: "white",
                        "&:hover": { backgroundColor: "#333" },
                      }}
                    >
                      Skaityti
                    </Button>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid2>
          ))
        )}
      </Grid2>
    </Container>
  );
}
