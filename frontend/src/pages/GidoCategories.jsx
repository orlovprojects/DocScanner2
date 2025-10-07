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

// ===== API URLs =====
const BASE_API = import.meta.env.VITE_BASE_API_URL.replace(/\/$/, "").replace(/\/api$/, "");

// ===== Helper functions =====
async function getCategoryBySlug(slug) {
  const res = await fetch(
    `${BASE_API}/guides-api/v2/pages/?type=docscanner_app.GuideCategoryPage&slug=${slug}&fields=title,slug,description,cat_image`
  );
  const data = await res.json();
  return data.items?.[0] || null;
}

async function getArticlesByCategoryId(categoryId) {
  const res = await fetch(
    `${BASE_API}/guides-api/v2/pages/?type=docscanner_app.GuidePage&child_of=${categoryId}&order=-first_published_at&fields=title,slug,main_image,first_published_at,author_name,search_description`
  );
  const data = await res.json();
  return data.items || [];
}

// ===== Component =====
export default function GidoCategories() {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const cat = await getCategoryBySlug(slug);
        if (cat) {
          setCategory(cat);
          const posts = await getArticlesByCategoryId(cat.id);
          setArticles(posts);
        }
      } catch (err) {
        console.error("❌ Error fetching category/articles:", err);
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

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <RouterLink
          to="/naudojimo-gidas"
          style={{ textDecoration: "none", color: "#1976d2" }}
        >
          Naudojimo gidas
        </RouterLink>
        <Typography color="text.primary">{category.title}</Typography>
      </Breadcrumbs>

      {/* Заголовок */}
      <Typography variant="h3" component="h1" fontWeight={800} sx={{ mb: 3 }}>
        {category.title}
      </Typography>

      {/* Grid */}
      <Grid2 container spacing={3}>
        {articles.map((p) => (
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
                to={`/straipsnis/${p.meta.slug}`}
                sx={{ alignSelf: "stretch" }}
              >
                <CardMedia
                  component="img"
                  image={p.main_image?.meta?.download_url || "/images/placeholder.jpg"}
                  alt={p.title}
                  sx={{
                    height: { xs: 180, sm: 200 },
                    objectFit: "cover",
                    transition: "transform .35s ease",
                    ".MuiCardActionArea-root:hover &": { transform: "scale(1.03)" },
                  }}
                />

                <CardContent sx={{ pb: 3 }}>
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    sx={{ color: "text.secondary", mb: 1 }}
                  >
                    <Typography variant="body2">{p.author_name || "—"}</Typography>
                    <Box
                      sx={{
                        width: 2,
                        height: 2,
                        bgcolor: "text.disabled",
                        borderRadius: 1,
                      }}
                    />
                    <Typography variant="body2">
                      {new Date(p.first_published_at).toLocaleDateString()}
                    </Typography>
                  </Stack>

                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{
                      mb: 2,
                      lineHeight: 1.25,
                      transition: "color .2s ease",
                      ".MuiCardActionArea-root:hover &": { color: "primary.main" },
                    }}
                  >
                    {p.title}
                  </Typography>

                  <Button variant="contained" color="error" size="small">
                    Skaityti straipsnį
                  </Button>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid2>
        ))}
      </Grid2>
    </Container>
  );
}

