// src/components/Icons.jsx
import { SvgIcon, Tooltip } from "@mui/material";

export function CreditInvoiceIcon(props) {
  return (
    <Tooltip title="Kreditinė sąskaita">
      <SvgIcon {...props} viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="#B7BDF7" />
        <text x="10" y="10.5" textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fontWeight="700" fill="#2D3282" fontFamily="Arial, sans-serif">
          Kr
        </text>
      </SvgIcon>
    </Tooltip>
  );
}

export function DebitInvoiceIcon(props) {
  return (
    <Tooltip title="Debetinė sąskaita">
      <SvgIcon {...props} viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="#BBDCE5" />
        <text x="10" y="10.5" textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fontWeight="700" fill="#1B4D5C" fontFamily="Arial, sans-serif">
          Db
        </text>
      </SvgIcon>
    </Tooltip>
  );
}