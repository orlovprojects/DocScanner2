import { useEffect, useState } from "react";
import { Alert, Button } from "@mui/material";

// Pasiūlymas pridėti savitarną į telefono ekraną (rodoma, kol neįdiegta ir neuždaryta)
export default function InstallHint() {
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem("esv_install_hint") === "0");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (standalone || hidden || (!prompt && !ios)) return null;
  const close = () => { localStorage.setItem("esv_install_hint", "0"); setHidden(true); };

  return (
    <Alert severity="info" onClose={close} sx={{ mb: 2 }}
      action={prompt ? <Button color="inherit" size="small" sx={{ minHeight: 36 }} onClick={() => prompt.prompt().then(close)}>Pridėti</Button> : undefined}>
      {ios
        ? "Kad nereikėtų kaskart ieškoti: paspauskite „Bendrinti“ ir „Pridėti prie pradžios ekrano“."
        : "Pridėkite savitarną į telefono ekraną – atsidarys kaip programėlė."}
    </Alert>
  );
}
