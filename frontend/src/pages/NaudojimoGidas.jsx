import * as React from "react";
import {
  Box,
  Container,
  Typography,
  TextField,
  Card,
  CardActionArea,
  CardContent,
  Grid2,
  Skeleton,
  useTheme,
  Alert,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { api } from "../api/endpoints";
import config from "../config";

const API_ORIGIN = (() => {
  try {
    return new URL(config.BASE_API_URL, window.location.href).origin;
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

export default function NaudojimoGidas() {
  const theme = useTheme();

  // === Категории ===
  const [categories, setCategories] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // === Поиск ===
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(-1);
  const reqIdRef = React.useRef(0);

  // Загрузка категорий (без фильтрации по query)
  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { data } = await api.get("guides/categories/");
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
        console.error("Nepavyko įkelti kategorijų:", err);
        if (isMounted) setError("Nepavyko įkelti kategorijų.");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Дебаунс-поиск (бьём на /guides-api/v2/search/ без /api)
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
        )}&limit=5`;

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
  }, [query]);

  // Навигация по выпадающему списку
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

  // helper для клика по элементу результата
  const resultHref = (r) =>
    r.type === "category"
      ? r.href || "#"
      : (r.href || "#").replace(/^\/gidas\//, "/straipsnis/");

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#fafafa" }}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        {/* Header */}
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
            Naudojimo gidas
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              maxWidth: 600,
              mx: "auto",
              fontSize: { xs: "0.95rem", md: "1.05rem" },
              lineHeight: 1.7,
            }}
          >
            Viską, ko reikia žinoti apie efektyvų darbą su DokSkeną – paprastai ir aiškiai
          </Typography>
        </Box>

        {/* Search */}
        <Box sx={{ mb: 6, display: "flex", justifyContent: "center" }}>
          <Box sx={{ position: "relative", width: "100%", maxWidth: 520 }}>
            <TextField
              placeholder="Ieškoti gidų..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(results.length > 0)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={onKeyDown}
              fullWidth
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

            {/* Dropdown results: только полный title, без описания и картинок */}
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
                    {/* Тип */}
                    <Box
                      sx={{
                        fontFamily: "Helvetica",
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

                    {/* Полный title: перенос строк включён */}
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
        </Box>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Video */}
        <Box sx={{ mb: { xs: 6, md: 9 } }}>
          <Typography
            variant="h2"
            textAlign="center"
            fontWeight={600}
            fontSize={36}
            sx={{ mb: 3 }}
          >
            Kaip pradėti su DokSkenu?
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ mb: 4, maxWidth: 660, mx: "auto", lineHeight: 1.7 }}
          >
            Šis video žingsnis po žingsnio parodys, ką reikia nustatyti, kad galėtumėt įkelti dokumentus skaitmenizuoti.
          </Typography>

          <Box
            sx={{
              position: "relative",
              width: "100%",
              maxWidth: 860,
              mx: "auto",
              aspectRatio: "16/9",
              borderRadius: 3,
              overflow: "hidden",
              backgroundColor: "#000",
            }}
          >
            <Box
              component="iframe"
              src="https://www.youtube.com/embed/falGn4_S_5Y"
              title="DocScanner Intro"
              allowFullScreen
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: 0,
              }}
            />
          </Box>
        </Box>

        {/* Categories */}
        <Grid2 container spacing={3}>
          {loading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <Grid2 key={idx} size={{ xs: 12, md: 4 }}>
                <Card
                  sx={{
                    borderRadius: 2,
                    overflow: "hidden",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <Skeleton
                    variant="rectangular"
                    sx={{ width: "100%", aspectRatio: "1/1" }}
                  />
                  <CardContent sx={{ p: 3 }}>
                    <Skeleton variant="text" width="80%" height={32} />
                    <Skeleton variant="text" width="100%" />
                    <Skeleton variant="text" width="90%" />
                    <Box sx={{ mt: 2 }}>
                      <Skeleton variant="text" width="40%" />
                    </Box>
                  </CardContent>
                </Card>
              </Grid2>
            ))
          ) : categories.length === 0 ? (
            <Grid2 size={12}>
              <Box sx={{ textAlign: "center", py: 8 }}>
                <SearchIcon
                  sx={{ fontSize: 64, color: "text.disabled", mb: 2 }}
                />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Nerasta jokių gidų
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Pabandykite pakeisti paieškos užklausą
                </Typography>
              </Box>
            </Grid2>
          ) : (
            categories.map((cat) => {
              const slug = String(cat?.slug ?? "");
              const href = slug ? `/kategorija/${slug}` : "#";
              const img = resolveMediaUrl(String(cat?.cat_image_url ?? ""));
              const title = String(cat?.title ?? "");
              const description = String(cat?.description ?? "");

              return (
                <Grid2 key={slug} size={{ xs: 12, md: 4 }}>
                  <Card
                    sx={{
                      height: "100%",
                      borderRadius: 2,
                      overflow: "hidden",
                      backgroundColor: "#ffffff",
                      border: "1px solid #e0e0e0",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        transform: "translateY(-2px)",
                      },
                    }}
                  >
                    <CardActionArea
                      href={href}
                      sx={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch",
                      }}
                    >
                      {/* Квадратная картинка или плейсхолдер */}
                      <Box
                        sx={{
                          width: "100%",
                          aspectRatio: "1/1",
                          backgroundColor: "#f5f5f5",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        {img ? (
                          <Box
                            component="img"
                            src={img}
                            alt={title}
                            loading="lazy"
                            sx={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              backgroundColor: "#f5f5f5",
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "text.disabled",
                            }}
                          >
                            <SearchIcon sx={{ fontSize: 48 }} />
                          </Box>
                        )}
                      </Box>

                      <CardContent
                        sx={{
                          p: 3,
                          flexGrow: 1,
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <Typography
                          variant="h6"
                          fontWeight={600}
                          mb={1}
                          sx={{ fontSize: "1.1rem" }}
                        >
                          {title}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ lineHeight: 1.7, flexGrow: 1 }}
                        >
                          {description.replace(/<[^>]+>/g, "")}
                        </Typography>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            mt: 2,
                            color: "primary.main",
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, mr: 0.5 }}
                          >
                            Žiūrėti
                          </Typography>
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








// import * as React from "react";
// import {
//   Box,
//   Container,
//   Typography,
//   TextField,
//   Card,
//   CardActionArea,
//   CardContent,
//   Grid2,
//   Skeleton,
//   useTheme,
//   Alert,
// } from "@mui/material";
// import SearchIcon from "@mui/icons-material/Search";
// import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
// import { api } from "../api/endpoints";
// import config from "../config";

// const API_ORIGIN = (() => {
//   try {
//     return new URL(config.BASE_API_URL, window.location.href).origin;
//   } catch {
//     return "";
//   }
// })();

// function resolveMediaUrl(url) {
//   if (!url) return "";
//   if (/^https?:\/\//i.test(url)) return url;
//   if (url.startsWith("/")) return `${API_ORIGIN}${url}`;
//   return `${API_ORIGIN}/${url}`;
// }

// export default function NaudojimoGidas() {
//   const theme = useTheme();
//   const [query, setQuery] = React.useState("");
//   const [categories, setCategories] = React.useState([]);
//   const [loading, setLoading] = React.useState(true);
//   const [error, setError] = React.useState("");

//   React.useEffect(() => {
//     let isMounted = true;

//     (async () => {
//       try {
//         const { data } = await api.get("guides/categories/");
//         if (!isMounted) return;

//         const list = Array.isArray(data) ? data.filter(Boolean) : [];
//         list.sort(
//           (a, b) =>
//             (Number(a?.order ?? 0) - Number(b?.order ?? 0)) ||
//             String(a?.title ?? "").localeCompare(String(b?.title ?? ""))
//         );

//         setCategories(list);
//         setError("");
//       } catch (err) {
//         console.error("Nepavyko įkelti kategorijų:", err);
//         if (isMounted) setError("Nepavyko įkelti kategorijų.");
//       } finally {
//         if (isMounted) setLoading(false);
//       }
//     })();

//     return () => {
//       isMounted = false;
//     };
//   }, []);

//   const filtered = React.useMemo(() => {
//     const q = query.toLowerCase();
//     return categories.filter((c) => {
//       const title = String(c?.title ?? "").toLowerCase();
//       const desc = String(c?.description ?? "").toLowerCase();
//       return title.includes(q) || desc.includes(q);
//     });
//   }, [categories, query]);

//   return (
//     <Box
//       sx={{
//         minHeight: "100vh",
//         backgroundColor: "#fafafa",
//       }}
//     >
//       <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
//         {/* Header */}
//         <Box sx={{ textAlign: "center", mb: { xs: 4, md: 6 } }}>
//           <Typography
//             variant="h2"
//             component="h1"
//             sx={{
//               fontWeight: 700,
//               fontSize: { xs: "2rem", sm: "2.5rem", md: "3rem" },
//               mb: 2,
//               background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
//               backgroundClip: "text",
//               WebkitBackgroundClip: "text",
//               WebkitTextFillColor: "transparent",
//               letterSpacing: "-0.02em",
//             }}
//           >
//             Naudojimo gidas
//           </Typography>
//           <Typography
//             variant="body1"
//             color="text.secondary"
//             sx={{
//               maxWidth: 600,
//               mx: "auto",
//               fontSize: { xs: "0.95rem", md: "1.05rem" },
//               lineHeight: 1.7,
//             }}
//           >
//             Viską, ko reikia žinoti apie DocScanner – paprastai ir aiškiai
//           </Typography>
//         </Box>

//         {/* Search */}
//         <Box sx={{ mb: 6, display: "flex", justifyContent: "center" }}>
//           <Box sx={{ position: "relative", width: "100%", maxWidth: 520 }}>
//             <TextField
//               placeholder="Ieškoti gidų..."
//               value={query}
//               onChange={(e) => setQuery(e.target.value)}
//               fullWidth
//               sx={{
//                 "& .MuiOutlinedInput-root": {
//                   pl: 6,
//                   borderRadius: 3,
//                   backgroundColor: "#ffffff",
//                 },
//               }}
//             />
//             <SearchIcon
//               sx={{
//                 position: "absolute",
//                 left: 14,
//                 top: "50%",
//                 transform: "translateY(-50%)",
//                 pointerEvents: "none",
//                 color: "text.secondary",
//               }}
//             />
//           </Box>
//         </Box>

//         {/* Error */}
//         {error && (
//           <Alert severity="error" sx={{ mb: 3 }}>
//             {error}
//           </Alert>
//         )}

//         {/* Video */}
//         <Box sx={{ mb: { xs: 6, md: 9 } }}>
//           <Typography
//             variant="h2"
//             textAlign="center"
//             fontWeight={600}
//             fontSize={36}
//             sx={{ mb: 3 }}
//           >
//             Kaip pradėti su DokSkenu?
//           </Typography>
//           <Typography
//             variant="body2"
//             color="text.secondary"
//             align="center"
//             sx={{ mb: 4, maxWidth: 660, mx: "auto", lineHeight: 1.7 }}
//           >
//             Greitas startas, žingsnis po žingsnio – nuo dokumentų įkėlimo iki
//             duomenų atpažinimo ir analizės
//           </Typography>

//           <Box
//             sx={{
//               position: "relative",
//               width: "100%",
//               maxWidth: 860,
//               mx: "auto",
//               aspectRatio: "16/9",
//               borderRadius: 3,
//               overflow: "hidden",
//               backgroundColor: "#000",
//             }}
//           >
//             <Box
//               component="iframe"
//               src="https://www.youtube.com/embed/falGn4_S_5Y"
//               title="DocScanner Intro"
//               allowFullScreen
//               sx={{
//                 position: "absolute",
//                 inset: 0,
//                 width: "100%",
//                 height: "100%",
//                 border: 0,
//               }}
//             />
//           </Box>
//         </Box>

//         {/* Categories */}
//         <Grid2 container spacing={3}>
//           {loading ? (
//             // Skeleton загрузка
//             Array.from({ length: 6 }).map((_, idx) => (
//               <Grid2 key={idx} size={{ xs: 12, md: 4 }}>
//                 <Card
//                   sx={{
//                     borderRadius: 2,
//                     overflow: "hidden",
//                     backgroundColor: "#ffffff",
//                   }}
//                 >
//                   <Skeleton
//                     variant="rectangular"
//                     sx={{ width: "100%", aspectRatio: "1/1" }}
//                   />
//                   <CardContent sx={{ p: 3 }}>
//                     <Skeleton variant="text" width="80%" height={32} />
//                     <Skeleton variant="text" width="100%" />
//                     <Skeleton variant="text" width="90%" />
//                     <Box sx={{ mt: 2 }}>
//                       <Skeleton variant="text" width="40%" />
//                     </Box>
//                   </CardContent>
//                 </Card>
//               </Grid2>
//             ))
//           ) : filtered.length === 0 ? (
//             // Empty state
//             <Grid2 size={12}>
//               <Box sx={{ textAlign: "center", py: 8 }}>
//                 <SearchIcon
//                   sx={{ fontSize: 64, color: "text.disabled", mb: 2 }}
//                 />
//                 <Typography variant="h6" color="text.secondary" gutterBottom>
//                   Nerasta jokių gidų
//                 </Typography>
//                 <Typography variant="body2" color="text.secondary">
//                   Pabandykite pakeisti paieškos užklausą
//                 </Typography>
//               </Box>
//             </Grid2>
//           ) : (
//             // Категории
//             filtered.map((cat) => {
//               const slug = String(cat?.slug ?? "");
//               const href = slug ? `/kategorija/${slug}` : "#";
//               const img = resolveMediaUrl(String(cat?.cat_image_url ?? ""));
//               const title = String(cat?.title ?? "");
//               const description = String(cat?.description ?? "");

//               return (
//                 <Grid2 key={slug} size={{ xs: 12, md: 4 }}>
//                   <Card
//                     sx={{
//                       height: "100%",
//                       borderRadius: 2,
//                       overflow: "hidden",
//                       backgroundColor: "#ffffff",
//                       border: "1px solid #e0e0e0",
//                       transition: "all 0.2s ease",
//                       "&:hover": {
//                         boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
//                         transform: "translateY(-2px)",
//                       },
//                     }}
//                   >
//                     <CardActionArea
//                       href={href}
//                       sx={{
//                         height: "100%",
//                         display: "flex",
//                         flexDirection: "column",
//                         alignItems: "stretch",
//                       }}
//                     >
//                       {/* Квадратная картинка или плейсхолдер */}
//                       <Box
//                         sx={{
//                           width: "100%",
//                           aspectRatio: "1/1",
//                           backgroundColor: "#f5f5f5",
//                           position: "relative",
//                           overflow: "hidden",
//                         }}
//                       >
//                         {img ? (
//                             <Box
//                             component="img"
//                             src={img}
//                             alt={title}
//                             loading="lazy"
//                             sx={{
//                                 width: "100%",
//                                 height: "100%",
//                                 objectFit: "contain",
//                                 backgroundColor: "#f5f5f5", // цвет «полей»
//                             }}
//                             />
//                         ) : (
//                           <Box
//                             sx={{
//                               width: "100%",
//                               height: "100%",
//                               display: "flex",
//                               alignItems: "center",
//                               justifyContent: "center",
//                               color: "text.disabled",
//                             }}
//                           >
//                             <SearchIcon sx={{ fontSize: 48 }} />
//                           </Box>
//                         )}
//                       </Box>

//                       <CardContent
//                         sx={{
//                           p: 3,
//                           flexGrow: 1,
//                           display: "flex",
//                           flexDirection: "column",
//                         }}
//                       >
//                         <Typography
//                           variant="h6"
//                           fontWeight={600}
//                           mb={1}
//                           sx={{ fontSize: "1.1rem" }}
//                         >
//                           {title}
//                         </Typography>
//                         <Typography
//                         variant="body2"
//                         color="text.secondary"
//                         sx={{ lineHeight: 1.7, flexGrow: 1 }}
//                         >
//                         {description.replace(/<[^>]+>/g, "")}
//                         </Typography>
//                         <Box
//                           sx={{
//                             display: "flex",
//                             alignItems: "center",
//                             mt: 2,
//                             color: "primary.main",
//                           }}
//                         >
//                           <Typography
//                             variant="body2"
//                             sx={{ fontWeight: 600, mr: 0.5 }}
//                           >
//                             Žiūrėti
//                           </Typography>
//                           <ArrowForwardIcon sx={{ fontSize: 18 }} />
//                         </Box>
//                       </CardContent>
//                     </CardActionArea>
//                   </Card>
//                 </Grid2>
//               );
//             })
//           )}
//         </Grid2>
//       </Container>
//     </Box>
//   );
// }
