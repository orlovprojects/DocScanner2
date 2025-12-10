// prerender.mjs
import fs from 'fs';
import path from 'path';
import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ какие роуты пререндерим (SEO-страницы)
const routesToPrerender = [
  '/',                                   // atlyginimo skaičiuoklė
  '/saskaitu-skaitmenizavimas-dokskenas',
  '/pvm-skaiciuokle',
  '/gpm-skaiciuokle',
  '/buhalterine-apskaita',
  '/suma-zodziais',
  // сюда позже можно добавить статьи гида
];

const distDir = path.resolve(__dirname, 'dist');
const port = 4173; // любой свободный порт на сервере

async function startServer() {
  const app = express();
  app.use(express.static(distDir));

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
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // важно для многих VPS
  });

  try {
    const page = await browser.newPage();

    for (const route of routesToPrerender) {
      const url = `http://localhost:${port}${route}`;
      console.log(`[prerender] Rendering ${url} ...`);

      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });

      const html = await page.content();

      const outPath =
        route === '/'
          ? path.join(distDir, 'index.html')
          : path.join(distDir, route.replace(/^\//, ''), 'index.html');

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