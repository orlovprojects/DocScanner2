// prerender.mjs
import fs from 'fs';
import path from 'path';
import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routesToPrerender = [
  '/saskaitu-skaitmenizavimas-dokskenas',
  '/pvm-skaiciuokle',
  '/gpm-skaiciuokle',
  '/buhalterine-apskaita',
  '/suma-zodziais',
];

const distDir = path.resolve(__dirname, 'dist');
const port = 4173;

async function startServer() {
  const app = express();
  app.use(express.static(distDir));

  // ✅ SPA fallback — без этого роуты возвращают "Cannot GET"
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`[prerender] Static server on http://localhost:${port}`);
      resolve(server);
    });
  });
}

async function prerender() {
  if (!fs.existsSync(distDir)) {
    console.error('[prerender] dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  const server = await startServer();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    for (const route of routesToPrerender) {
      const url = `http://localhost:${port}${route}`;
      console.log(`[prerender] Rendering ${url} ...`);

      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 120000,
      });

      // даём React + Helmet время отработать
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const html = await page.content();

      // Проверяем что рендер успешен
      if (html.includes('Cannot GET') || html.includes('<title>Error</title>')) {
        console.error(`[prerender] ERROR: Failed to render ${route}`);
        continue;
      }

      const outPath = path.join(distDir, route.replace(/^\//, ''), 'index.html');

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html, 'utf-8');

      console.log(`[prerender] Saved: ${outPath}`);
    }

    console.log('[prerender] Done.');
  } catch (err) {
    console.error('[prerender] Error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

prerender();