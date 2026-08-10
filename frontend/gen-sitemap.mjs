// gen-sitemap.mjs — пересобирает dist/sitemap.xml из статических роутов + слагов из API
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const ORIGIN = 'https://atlyginimoskaiciuokle.com';
const API = 'http://127.0.0.1:8000';

// статические лендинги/разделы (держи синхронно с prerender.mjs)
const STATIC = [
  '/', '/saskaitu-skaitmenizavimas-dokskenas', '/apie-mus', '/registruotis',
  '/prisijungti', '/pvm-skaiciuokle', '/gpm-skaiciuokle', '/buhalterine-apskaita',
  '/suma-zodziais', '/saskaitu-israsymas', '/naudojimo-gidas', '/tinklarastis',
  '/susisiekti', '/privatumo-politika', '/naudojimo-taisykles', '/site-pro',
  '/rivile', '/agnum', '/apsa', '/centas', '/apskaita5', '/pragma', '/debetas',
  '/finvalda', '/individualios-veiklos-skaiciuokle',
];

async function getJson(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function main() {
  const routes = [...STATIC];

  const blogCats = await getJson(`${API}/blog-api/v2/blog-categories/`);
  (Array.isArray(blogCats) ? blogCats : []).forEach(c => c?.slug && routes.push(`/tinklarastis/tema/${c.slug}`));

  const blogPosts = await getJson(`${API}/blog-api/v2/posts/`);
  (Array.isArray(blogPosts) ? blogPosts : []).forEach(p => p?.slug && routes.push(`/tinklarastis/${p.slug}`));

  const guideCats = await getJson(`${API}/guides-api/v2/guide-categories/`);
  (Array.isArray(guideCats) ? guideCats : []).forEach(c => c?.slug && routes.push(`/kategorija/${c.slug}`));

  const guideArticles = await getJson(`${API}/guides-api/v2/guides/`);
  (Array.isArray(guideArticles) ? guideArticles : []).forEach(a => a?.slug && routes.push(`/straipsnis/${a.slug}`));

  const seen = new Set();
  const urls = [];
  for (const r of routes) {
    const p = r === '/' ? '/' : r.replace(/\/+$/, '');
    if (seen.has(p)) continue;
    seen.add(p);
    urls.push(`  <url><loc>${ORIGIN}${p}</loc></url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), xml, 'utf-8');
  console.log(`[gen-sitemap] ${urls.length} URL`);
}

main();