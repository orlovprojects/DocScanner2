import { Box, Typography } from "@mui/material";
import WeekendIcon from "@mui/icons-material/Weekend";

export const ILT_MONTHS = {
  "kompiuterinė technika": 36,
  "ryšių priemonės": 36,
  "programinė įranga": 36,
  "įsigytos teisės": 36,
  "baldai": 72,
  "lengvasis automobilis": 72,
  "krovininis automobilis": 48,
  "mašinos ir įrengimai": 60,
  "įrenginiai": 96,
  "inventorius": 72,
  "kitas materialusis turtas": 48,
  "kitas nematerialusis turtas": 48,
};

export const ILT_COLORS = {
  bg: "#FFF8EE",
  border: "#F0D7B1",
  icon: "#e08d21",
  iconBg: "#F8E7CF",
  title: "#7A4A12",
  text: "#5F513A",
};

const colors = ILT_COLORS;

const InfoLine = ({ label, children }) => (
  <Typography sx={{ fontSize: "0.8rem", color: colors.text, mt: 0.25 }}>
    {label}: <Box component="span" sx={{ fontWeight: 700 }}>{children}</Box>
  </Typography>
);

export default function IltBanner({
  assetType,
  subtotal,
  currency,
  variant = "full",
  showMonthly = false,
  actions = null,
}) {
  const months = assetType ? ILT_MONTHS[assetType] : null;
  const monthlyAmount =
    months && subtotal && currency === "EUR"
      ? Math.round((Number(subtotal) / months) * 100) / 100
      : null;

  if (variant === "line") {
    return (
      <Box sx={{ mt: 1.25, mb: 1.5 }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            px: 1,
            py: 0.45,
            borderRadius: 1.5,
            bgcolor: colors.bg,
            border: `1px solid ${colors.border}`,
          }}
        >
          <WeekendIcon sx={{ color: colors.icon, fontSize: 17 }} />
          <Typography sx={{ fontWeight: 600, fontSize: "0.78rem", color: colors.title }}>
            Galimas ilgalaikis turtas
          </Typography>
        </Box>

        <Box
          sx={{
            mt: 1,
            p: 1.25,
            borderRadius: 2,
            bgcolor: colors.bg,
            border: `1px solid ${colors.border}`,
          }}
        >
          <Typography sx={{ fontWeight: 600, fontSize: "0.82rem", color: colors.title, mb: 0.5 }}>
            Ilgalaikio turto informacija
          </Typography>

          {assetType && (
            <InfoLine label="Kategorija">
              {assetType}
            </InfoLine>
          )}

          {months && (
            <InfoLine label="Rekomenduojamas nusidėvėjimo laikotarpis">
              {months} mėn.
            </InfoLine>
          )}

          {monthlyAmount != null && showMonthly && (
            <InfoLine label="Numatomas mėnesinis nusidėvėjimas">
              {monthlyAmount.toFixed(2)} EUR
            </InfoLine>
          )}

          {actions && <Box sx={{ mt: 1.25 }}>{actions}</Box>}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        p: 1.5,
        mb: 1.5,
        borderRadius: 2,
        bgcolor: colors.bg,
        border: `1px solid ${colors.border}`,
        boxShadow: "0 1px 2px rgba(124, 74, 18, 0.06)",
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          bgcolor: colors.iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <WeekendIcon sx={{ color: colors.icon, fontSize: 20 }} />
      </Box>

      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: "0.85rem", color: colors.title }}>
          Atpažintas galimas ilgalaikis turtas
        </Typography>

        {variant === "detaliai_doc" && (
          <Typography sx={{ fontSize: "0.8rem", color: colors.text, mt: 0.25 }}>
            Išskleiskite eilutes
          </Typography>
        )}

        {variant === "full" && assetType && (
          <>
            <InfoLine label="Kategorija">
              {assetType}
            </InfoLine>

            {months && (
              <InfoLine label="Rekomenduojamas nusidėvėjimo laikotarpis">
                {months} mėn.
              </InfoLine>
            )}

            {monthlyAmount != null && showMonthly && (
              <InfoLine label="Numatomas mėnesinis nusidėvėjimas">
                {monthlyAmount.toFixed(2)} EUR
              </InfoLine>
            )}
          </>
        )}

        {actions && <Box sx={{ mt: 1.25 }}>{actions}</Box>}
      </Box>
    </Box>
  );
}