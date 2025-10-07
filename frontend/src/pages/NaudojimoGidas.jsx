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
  InputAdornment,
  Fade,
  alpha,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DescriptionIcon from "@mui/icons-material/Description";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import BuildIcon from "@mui/icons-material/Build";

export default function NaudojimoGidas() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  const [query, setQuery] = React.useState("");

  const categories = [
    {
      title: "Kaip naudoti OCR",
      description:
        "Sužinokite, kaip automatiškai atpažinti tekstą iš sąskaitų ir dokumentų.",
      icon: DescriptionIcon,
      href: "/guides/ocr",
      color: "#6366f1",
    },
    {
      title: "Prenumeratos ir kreditai",
      description:
        "Kaip valdyti prenumeratą, įsigyti kreditus ir tikrinti balansą.",
      icon: CreditCardIcon,
      href: "/guides/subscriptions",
      color: "#8b5cf6",
    },
    {
      title: "Kaip taisyti klaidas",
      description:
        "Sprendimai dažniausioms klaidoms ir patarimai, kaip išvengti OCR netikslumų.",
      icon: BuildIcon,
      href: "/guides/errors",
      color: "#ec4899",
    },
  ];

  const filtered = categories.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.description.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${alpha(
          theme.palette.primary.main,
          0.03
        )} 0%, ${alpha(theme.palette.background.paper, 1)} 100%)`,
      }}
    >
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        {/* Header */}
        <Fade in timeout={600}>
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
              Viską, ko reikia žinoti apie DocScanner – paprastai ir aiškiai
            </Typography>
          </Box>
        </Fade>

        {/* Search */}
        <Fade in timeout={800}>
          <Box sx={{ mb: { xs: 5, md: 7 }, display: "flex", justifyContent: "center" }}>
            <TextField
              placeholder="Ieškoti gidų..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              fullWidth
              sx={{
                maxWidth: 520,
                "& .MuiOutlinedInput-root": {
                  borderRadius: 3,
                  backgroundColor: theme.palette.background.paper,
                  boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, 0.06)}`,
                  transition: "all 0.3s ease",
                  "&:hover": {
                    boxShadow: `0 4px 12px ${alpha(theme.palette.common.black, 0.1)}`,
                  },
                  "&.Mui-focused": {
                    boxShadow: `0 4px 16px ${alpha(
                      theme.palette.primary.main,
                      0.2
                    )}`,
                  },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "text.secondary" }} />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </Fade>

        {/* Video Section */}
        <Fade in timeout={1000}>
          <Box sx={{ mb: { xs: 6, md: 9 } }}>
            <Typography
              variant="h5"
              component="h2"
              textAlign="center"
              fontWeight={600}
              sx={{ mb: 3, fontSize: { xs: "1.25rem", md: "1.5rem" } }}
            >
              Kaip pradėti su DokSkenu?
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
              sx={{ mb: 4, maxWidth: 660, mx: "auto", lineHeight: 1.7 }}
            >
              Greitas startas, žingsnis po žingsnio – nuo dokumentų įkėlimo
              iki duomenų atpažinimo ir analizės
            </Typography>

            <Box
              sx={{
                position: "relative",
                width: "100%",
                maxWidth: 860,
                mx: "auto",
                aspectRatio: "16 / 9",
                borderRadius: 3,
                overflow: "hidden",
                boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.12)}`,
              }}
            >
              <Box
                component="iframe"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                title="DocScanner Intro"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
        </Fade>

        {/* Categories Grid */}
        <Grid2 container spacing={{ xs: 2.5, md: 3 }}>
          {filtered.map((cat, idx) => {
            const IconComponent = cat.icon;
            return (
              <Grid2 key={cat.title} size={{ xs: 12, sm: 6, md: 4 }}>
                <Fade in timeout={1200 + idx * 100}>
                  <Card
                    elevation={0}
                    sx={{
                      height: "100%",
                      borderRadius: 3,
                      border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                      backgroundColor: theme.palette.background.paper,
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      "&:hover": {
                        transform: "translateY(-6px)",
                        boxShadow: `0 12px 28px ${alpha(cat.color, 0.15)}`,
                        borderColor: alpha(cat.color, 0.3),
                      },
                    }}
                  >
                    <CardActionArea
                      href={cat.href}
                      sx={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch",
                        justifyContent: "flex-start",
                      }}
                    >
                      <CardContent
                        sx={{
                          p: { xs: 3, md: 3.5 },
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {/* Icon */}
                        <Box
                          sx={{
                            width: 56,
                            height: 56,
                            borderRadius: 2,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            mb: 2.5,
                            background: alpha(cat.color, 0.1),
                            transition: "all 0.3s ease",
                            ".MuiCardActionArea-root:hover &": {
                              background: alpha(cat.color, 0.15),
                              transform: "scale(1.05)",
                            },
                          }}
                        >
                          <IconComponent
                            sx={{ fontSize: 28, color: cat.color }}
                          />
                        </Box>

                        {/* Title */}
                        <Typography
                          variant="h6"
                          component="h3"
                          sx={{
                            fontWeight: 600,
                            mb: 1.5,
                            fontSize: { xs: "1.1rem", md: "1.15rem" },
                            lineHeight: 1.4,
                            transition: "color 0.2s ease",
                            ".MuiCardActionArea-root:hover &": {
                              color: cat.color,
                            },
                          }}
                        >
                          {cat.title}
                        </Typography>

                        {/* Description */}
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            lineHeight: 1.7,
                            flex: 1,
                            fontSize: "0.9rem",
                          }}
                        >
                          {cat.description}
                        </Typography>

                        {/* Arrow */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            mt: 2.5,
                            color: cat.color,
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              mr: 0.5,
                              fontSize: "0.875rem",
                            }}
                          >
                            Sužinoti daugiau
                          </Typography>
                          <ArrowForwardIcon
                            sx={{
                              fontSize: 18,
                              transition: "transform 0.2s ease",
                              ".MuiCardActionArea-root:hover &": {
                                transform: "translateX(4px)",
                              },
                            }}
                          />
                        </Box>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Fade>
              </Grid2>
            );
          })}
        </Grid2>

        {/* Empty State */}
        {filtered.length === 0 && (
          <Fade in timeout={400}>
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
          </Fade>
        )}
      </Container>
    </Box>
  );
}