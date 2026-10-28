import { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Dialog, DialogContent, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";

import { pagedHtml } from "./dasPaged";

// Dokumento (HTML) peržiūra A4 lapais: viršuje - pavadinimas, „A4 · N psl.“, Spausdinti / PDF, uždaryti.
// html === null - kraunama. actions - mygtukai apačioje (nebūtina).
// PDF failo pavadinimas = dokumento <title> (naršyklė siūlo jį saugant), arba fileName
const htmlTitle = (html) => {
  const m = /<title>([^<]*)<\/title>/i.exec(html || "");
  if (!m) return "";
  const t = document.createElement("textarea");
  t.innerHTML = m[1];
  return t.value.trim();
};

export default function DocPreviewDialog({ open, title, sub, html, onClose, actions, fileName }) {
  const frame = useRef(null);
  const print = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    const name = fileName || htmlTitle(html) || title || "";
    const old = document.title;
    if (name) { document.title = name; try { w.document.title = name; } catch { /* kitas origin */ } }
    const restore = () => { document.title = old; w.removeEventListener("afterprint", restore); };
    w.addEventListener("afterprint", restore);
    w.print();
    setTimeout(restore, 1500);
  };
  const [pages, setPages] = useState(0);
  useEffect(() => { if (!open) setPages(0); }, [open, html]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" disableScrollLock PaperProps={{ sx: { height: "90vh", borderRadius: 3 } }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 3, pt: 2, pb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 17, color: "#101828" }}>{title}</Typography>
          <Typography sx={{ fontSize: 12.5, color: "#667085" }}>{[sub, pages ? `A4 · ${pages} psl.` : ""].filter(Boolean).join(" · ")}</Typography>
        </Box>
        <Button variant="outlined" color="inherit" startIcon={<PrintOutlinedIcon />} disabled={!html}
          onClick={print}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, borderColor: "#D0D5DD", color: "#344054" }}>Spausdinti / PDF</Button>
        <IconButton onClick={onClose} aria-label="Uždaryti"><CloseIcon /></IconButton>
      </Stack>
      <DialogContent sx={{ display: "flex", flexDirection: "column", pb: actions ? 1 : 2.5 }}>
        <Box sx={{ flex: 1, minHeight: 0, borderRadius: 2, overflow: "hidden", border: "1px solid #EAECF0", bgcolor: "#F2F4F7", position: "relative" }}>
          {!html && <CircularProgress size={24} sx={{ position: "absolute", top: "45%", left: "50%" }} />}
          {html && (
            <iframe ref={frame} title={title} srcDoc={pagedHtml(html)}
              onLoad={() => setPages(frame.current?.contentWindow?.__pages || 0)}
              style={{ width: "100%", height: "100%", border: 0, display: "block" }} />
          )}
        </Box>
      </DialogContent>
      {actions && <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 3, pb: 2 }}>{actions}</Stack>}
    </Dialog>
  );
}
