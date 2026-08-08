import * as React from "react";
import { Helmet } from "react-helmet";
import {
  Box, Container, Typography, TextField, Card, CardActionArea,
  CardContent, Grid2, Skeleton, useTheme, Alert,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

const API_ORIGIN = (() => {
  try {
    return new URL(import.meta.env.VITE_BASE_API_URL, window.location.href).origin;
  } catch {
    return "";
  }
})();

function resolveMediaUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${API_ORIGIN}${url}`;
  return `${API_ORIGIN}/${url}`;
}

export default function Tinklarastis() {
  const theme = useTheme();

  const [categories, setCategories] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(-1);
  const reqIdRef = React.useRef(0);

  React.useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const resp = await fetch(`${API_ORIGIN}/blog-api/v2/blog-categories/`);
        const data = await resp.json();
        if (!isMounted) return;
        const list = Array.isArray(data) ? data.filter(Boolean) : [];
        list.sort(
          (a, b) =>
            (Number(a?.order ?? 0) - Number(b?.order ?? 0)) ||
            String(a?.title ?? "").localeCompare(String(b?.title ?? ""))
        );
        setCategories(list);
        setError("");
      } catch (err) {
        console.error("Nepavyko įkelti temų:", err);
        if (isMounted) setError("Nepavyko įkelti temų.");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  React.useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]); setOpen(false); setHighlight(-1);
      return;
    }
    const currentId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const url = `${API_ORIGIN}/blog-api/v2/search/?q=${encodeURIComponent(query.trim())}&limit=5`;
        const resp = await fetch(url, { method: "GET", credentials: "include" });
        if (currentId !== reqIdRef.current) return;
        if (!resp.ok) { setResults([]); setOpen(false); setHighlight(-1); return; }
        const data = await resp.json();
        const list = Array.isArray(data?.results) ? data.results : [];
        setResults(list); setOpen(list.length > 0); setHighlight(list.length ? 0 : -1);
      } catch (e) {
        if (currentId !== reqIdRef.current) return;
        setResults([]); setOpen(false); setHighlight(-1);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[highlight] ?? results[0];
      if (item?.href) window.location.href = item.href;
    } else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#fafafa" }}>
      <Helmet>
        <title>Tinklaraštis – DokSkenas</title>
        <meta
          name="description"
          content="DokSkenas tinklaraštis: patarimai apie dokumentų skaitmenizavimą, apskaitą, PVM ir integracijas su apskaitos programomis."
        />
      </Helmet>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        <Box sx={{ textAlign: "center", mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontWeight: 700,
              fontSize: { xs: "2rem", sm: "2.5rem", md: "3rem" },
              mb: 2,
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.02em",
            }}
          >
            Tinklaraštis
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 600, mx: "auto", fontSize: { xs: "0.95rem", md: "1.05rem" }, lineHeight: 1.7 }}
          >
            Naudingi straipsniai apie apskaitą, dokumentų skaitmenizavimą ir DokSkeno galimybes
          </Typography>
        </Box>

        {/* Search */}
        <Box sx={{ mb: 6, display: "flex", justifyContent: "center" }}>
          <Box sx={{ position: "relative", width: "100%", maxWidth: 520 }}>
            <TextField
              name="custom_search_field"
              placeholder="Ieškoti straipsnių..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(results.length > 0)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={onKeyDown}
              fullWidth
              autoComplete="off"
              slotProps={{ input: { autoComplete: "off", "aria-autocomplete": "none" } }}
              sx={{ "& .MuiOutlinedInput-root": { pl: 6, borderRadius: 3, backgroundColor: "#ffffff" } }}
            />
            <SearchIcon sx={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "text.secondary" }} />
            {open && results.length > 0 && (
              <Box
                sx={{
                  position: "absolute", top: "100%", left: 0, right: 0, mt: 1, zIndex: 10,
                  backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: 2,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.08)", overflow: "hidden",
                }}
                onMouseLeave={() => setHighlight(-1)}
              >
                {results.map((r, idx) => (
                  <Box
                    key={`${r.type}-${r.id}`}
                    component="a"
                    href={r.href || "#"}
                    onClick={() => setOpen(false)}
                    onMouseEnter={() => setHighlight(idx)}
                    sx={{
                      display: "flex", alignItems: "flex-start", textDecoration: "none", color: "inherit",
                      px: 2, py: 1.5, gap: 1.5,
                      backgroundColor: idx === highlight ? "action.hover" : "transparent",
                      "&:hover": { backgroundColor: "action.hover" },
                    }}
                  >
                    <Box sx={{ fontFamily: "Helvetica", fontWeight: 300, fontSize: 10, opacity: 0.7, minWidth: 72, textTransform: "uppercase", pt: "2px" }}>
                      {r.type === "category" ? "Tema" : "Straipsnis"}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={600} sx={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.35 }}>
                        {r.title}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {/* Categories */}
        <Grid2 container spacing={3}>
          {loading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <Grid2 key={idx} size={{ xs: 12, md: 4 }}>
                <Card sx={{ borderRadius: 2, overflow: "hidden", backgroundColor: "#ffffff" }}>
                  <Skeleton variant="rectangular" sx={{ width: "100%", aspectRatio: "1/1" }} />
                  <CardContent sx={{ p: 3 }}>
                    <Skeleton variant="text" width="80%" height={32} />
                    <Skeleton variant="text" width="100%" />
                    <Skeleton variant="text" width="90%" />
                  </CardContent>
                </Card>
              </Grid2>
            ))
          ) : categories.length === 0 ? (
            <Grid2 size={12}>
              <Box sx={{ textAlign: "center", py: 8 }}>
                <SearchIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>Kol kas nėra straipsnių</Typography>
              </Box>
            </Grid2>
          ) : (
            categories.map((cat) => {
              const slug = String(cat?.slug ?? "");
              const href = slug ? `/tinklarastis/tema/${slug}` : "#";
              const img = resolveMediaUrl(String(cat?.cat_image_url ?? ""));
              const title = String(cat?.title ?? "");
              const description = String(cat?.description ?? "");
              return (
                <Grid2 key={slug} size={{ xs: 12, md: 4 }}>
                  <Card
                    sx={{
                      height: "100%", borderRadius: 2, overflow: "hidden", backgroundColor: "#ffffff",
                      border: "1px solid #e0e0e0", transition: "all 0.2s ease",
                      "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.08)", transform: "translateY(-2px)" },
                    }}
                  >
                    <CardActionArea href={href} sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                      <Box sx={{ width: "100%", aspectRatio: "1/1", backgroundColor: "#f5f5f5", position: "relative", overflow: "hidden" }}>
                        {img ? (
                          <Box component="img" src={img} alt={title} loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#f5f5f5" }} />
                        ) : (
                          <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "text.disabled" }}>
                            <SearchIcon sx={{ fontSize: 48 }} />
                          </Box>
                        )}
                      </Box>
                      <CardContent sx={{ p: 3, flexGrow: 1, display: "flex", flexDirection: "column" }}>
                        <Typography variant="h6" fontWeight={600} mb={1} sx={{ fontSize: "1.1rem" }}>{title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, flexGrow: 1 }}>
                          {description.replace(/<[^>]+>/g, "")}
                        </Typography>
                        <Box sx={{ display: "flex", alignItems: "center", mt: 2, color: "primary.main" }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>Žiūrėti</Typography>
                          <ArrowForwardIcon sx={{ fontSize: 18 }} />
                        </Box>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid2>
              );
            })
          )}
        </Grid2>
      </Container>
    </Box>
  );
}