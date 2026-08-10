// prerender-one.mjs — пререндер ОДНОГО маршрута. Вызов: node prerender-one.mjs /tinklarastis/slug
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = 4174; // отдельный порт, чтобы не конфликтовать с полным прогоном
const PROD_ORIGIN = 'https://atlyginimoskaiciuokle.com';

const route = process.argv[2];
if (!route || !route.startsWith('/')) {
  console.error('Usage: node prerender-one.mjs /path/slug');
  process.exit(1);
}

function cleanHtml(html) {
  html = html
    .replace(/http:\/\/localhost:4174/g, PROD_ORIGIN)
    .replace(/http:\/\/127\.0\.0\.1:8000/g, PROD_ORIGIN)
    .replace(/<title>DokSkenas<\/title>/g, '')
    .replace(/<title>DokSkenas app<\/title>/g, '')
    .replace(/<meta name="description" content="[^"]*"(?! data-react-helmet)\s*\/?>/g, '')
    .replace(/<script[^>]*connect\.facebook\.net[^>]*><\/script>/g, '')
    .replace(/<script[^>]*googletagmanager\.com[^>]*><\/script>/g, '')
    .replace(/\n\s*\n/g, '\n');
  return html;
}

function startServer() {
  const app = express();
  const apiProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    pathFilter: ['/api/**', '/blog-api/**', '/guides-api/**', '/media/**'],
  });
  app.use(apiProxy);
  app.use(express.static(distDir));
  app.use((req, res) => res.sendFile(path.join(distDir, 'index.html')));
  return new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });
}

(async () => {
  const server = await startServer();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { window.__PRERENDER = true; });
    await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1500));

    let html = await page.content();
    html = cleanHtml(html);

    const outDir = path.join(distDir, route.replace(/^\//, ''));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
    console.log(`[prerender-one] saved: ${outDir}/index.html`);
  } catch (e) {
    console.error(`[prerender-one] error on ${route}:`, e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();