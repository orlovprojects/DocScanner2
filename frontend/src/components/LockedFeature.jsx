import { Box, Tooltip } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import { useInvSubscription } from "../contexts/InvSubscriptionContext";

const LockedFeature = ({ feature, children, tooltipPlacement = "top" }) => {
  const { isFeatureLocked } = useInvSubscription();
  const locked = isFeatureLocked(feature);

  if (!locked) return children;

  return (
    <Tooltip
      title={
        <span>
          Ši funkcija leidžiama tik turintiems mokamą planą.{" "}
          <a
            href="/kainos"
            style={{ color: "#90CAF9", textDecoration: "underline" }}
          >
            Įsigyti planą
          </a>
        </span>
      }
      placement={tooltipPlacement}
      arrow
    >
      <Box
        sx={{
          position: "relative",
          display: "inline-flex",
          opacity: 0.5,
          pointerEvents: "auto",
          cursor: "not-allowed",
          "& > *": {
            pointerEvents: "none",
          },
        }}
      >
        {children}
        <LockIcon
          sx={{
            position: "absolute",
            top: -6,
            right: -6,
            fontSize: 16,
            color: "#d32f2f",
          }}
        />
      </Box>
    </Tooltip>
  );
};

export default LockedFeature;