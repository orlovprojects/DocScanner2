import React, { useEffect, useState } from "react";
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
} from "@mui/material";
import { Link as RouterLink, useParams } from "react-router-dom";

// ===== API base =====
const BASE_API = import.meta.env.VITE_BASE_API_URL
  .replace(/\/$/, "")
  .replace(/\/api$/, "");

// ===== Helper =====
async function getCategoryWithArticles(slug) {
  const res = await fetch(`${BASE_API}/guides-api/v2/guide-categories/${slug}/`);
  if (!res.ok) return null;
  return res.json();
}

export default function GidoCategoryPage() {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      <Breadcrumbs sx={{ mb: 2 }}>
        <RouterLink
          to="/naudojimo-gidas"
          style={{ textDecoration: "none", color: "#1462b0ff" }}
        >
          Naudojimo gidas
        </RouterLink>
        <Typography color="text.primary">{category.title}</Typography>
      </Breadcrumbs>

      {/* Category title */}
      <Typography variant="h3" component="h1" fontWeight={800} sx={{ mb: 3 }}>
        {category.title}
      </Typography>

      {/* Category description */}
      {category.description && (
        <Typography
          variant="body1"
          sx={{ mb: 5, color: "text.secondary" }}
          dangerouslySetInnerHTML={{ __html: category.description }}
        />
      )}

      {/* Articles grid */}
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
                        {p.first_published_at
                          ? new Date(p.first_published_at).toLocaleDateString(
                              "lt-LT",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )
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
                        "&:hover": {
                        backgroundColor: "#333",
                        },
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


