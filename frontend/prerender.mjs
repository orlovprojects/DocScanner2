// prerender.mjs
import fs from 'fs';
import path from 'path';
import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routesToPrerender = [
  '/',                      
  '/2025',                      
  '/saskaitu-skaitmenizavimas-dokskenas',
  '/pvm-skaiciuokle',
  '/gpm-skaiciuokle',
  '/buhalterine-apskaita',
  '/suma-zodziais',
  '/saskaita-faktura',
  '/naudojimo-gidas',
  '/susisiekti',
  '/privatumo-politika',
  '/naudojimo-taisykles',
];

const distDir = path.resolve(__dirname, 'dist');
const port = 4173;

async function startServer() {
  const app = express();
  app.use(express.static(distDir));

  app.use((req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`[prerender] Static server on http://localhost:${port}`);
      resolve(server);
    });
  });
}

function cleanHtml(html) {
  // Удаляем title "DokSkenas" (без data-react-helmet)
  html = html.replace(/<title>DokSkenas<\/title>/g, '');
  html = html.replace(/<title>DokSkenas app<\/title>/g, '');
  
  // Удаляем meta description БЕЗ data-react-helmet
  html = html.replace(
    /<meta name="description" content="[^"]*"(?! data-react-helmet)\s*\/?>/g,
    ''
  );
  
  // Удаляем дубликаты пустых строк
  html = html.replace(/\n\s*\n/g, '\n');
  
  return html;
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
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));

      let html = await page.content();

      if (html.includes('Cannot GET') || html.includes('<title>Error</title>')) {
        console.error(`[prerender] ERROR: Failed to render ${route}`);
        continue;
      }

      // Чистим HTML от дубликатов
      html = cleanHtml(html);

      // Все страницы в папки, / -> dist/_home/index.html
      const folderName = route === '/' ? '_home' : route.replace(/^\//, '');
      const outPath = path.join(distDir, folderName, 'index.html');

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