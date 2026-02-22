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
  '/apie-mus',
  '/registruotis',
  '/prisijungti',
  '/pvm-skaiciuokle',
  '/gpm-skaiciuokle',
  '/buhalterine-apskaita',
  '/suma-zodziais',
  '/saskaita-faktura',
  '/naudojimo-gidas',
  '/susisiekti',
  '/privatumo-politika',
  '/naudojimo-taisykles',
  '/site-pro',
  '/rivile',
  '/agnum',
  '/apsa',
  '/centas',
  '/apskaita5',
  '/pragma',
  '/debetas',
  '/finvalda',
];

const distDir = path.resolve(__dirname, 'dist');
const port = 4173;

const loaderStyles = `
<style id="prerender-loader-styles">
  .prerender-loader {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .prerender-loader-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e0e0e0;
    border-top-color: #1976d2;
    border-radius: 50%;
    animation: prerender-spin 1s linear infinite;
  }
  .prerender-loader-text {
    margin-top: 16px;
    color: #666;
    font-size: 14px;
  }
  @keyframes prerender-spin {
    to { transform: rotate(360deg); }
  }
</style>
`;

const loaderHtml = `
<div class="prerender-loader" id="prerender-loader">
  <div class="prerender-loader-spinner"></div>
  <div class="prerender-loader-text">Kraunama...</div>
</div>
`;

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
  html = html.replace(/<title>DokSkenas<\/title>/g, '');
  html = html.replace(/<title>DokSkenas app<\/title>/g, '');
  
  html = html.replace(
    /<meta name="description" content="[^"]*"(?! data-react-helmet)\s*\/?>/g,
    ''
  );

  html = html.replace(/<script[^>]*connect\.facebook\.net[^>]*><\/script>/g, '');
  html = html.replace(/<script[^>]*googletagmanager\.com[^>]*><\/script>/g, '');
  
  html = html.replace(/\n\s*\n/g, '\n');
  
  return html;
}

function addLoader(html) {
  html = html.replace('</head>', loaderStyles + '</head>');
  html = html.replace(/<body([^>]*)>/, '<body$1>' + loaderHtml);
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

    // Включаем логирование console из браузера
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[browser error] ${msg.text()}`);
      }
    });

    for (const route of routesToPrerender) {
      const url = `http://localhost:${port}${route}`;
      console.log(`\n[prerender] ========== Rendering ${url} ==========`);

      await page.goto(url, {
        waitUntil: 'networkidle0',  // ждём пока сеть успокоится
        timeout: 30000,
      });

      // Ждём пока React Helmet обновит title (не дефолтный)
      try {
        await page.waitForFunction(
          () => {
            const title = document.querySelector('title');
            return title && 
                   title.textContent && 
                   title.textContent !== 'DokSkenas' && 
                   title.textContent !== 'DokSkenas app';
          },
          { timeout: 10000 }
        );
        console.log(`[prerender] ✓ Title updated`);
      } catch (e) {
        console.warn(`[prerender] ✗ Warning: Title not updated for ${route} (stayed default)`);
      }

      // Ждём meta description с data-react-helmet
      try {
        await page.waitForSelector('meta[name="description"][data-react-helmet="true"]', {
          timeout: 5000
        });
        console.log(`[prerender] ✓ Meta description with react-helmet found`);
      } catch (e) {
        console.warn(`[prerender] ✗ Warning: Meta description with react-helmet not found for ${route}`);
      }

      // Дополнительная пауза для стабильности
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // === ОТЛАДКА: смотрим что получилось ===
      const pageTitle = await page.title();
      
      const metaDescHelmet = await page.$eval(
        'meta[name="description"][data-react-helmet="true"]', 
        el => el.getAttribute('content')
      ).catch(() => null);
      
      const metaDescRegular = await page.$eval(
        'meta[name="description"]:not([data-react-helmet])', 
        el => el.getAttribute('content')
      ).catch(() => null);

      const allTitles = await page.$$eval('title', els => els.map(el => el.textContent));
      
      const hasContent = await page.$eval('#root', el => el.innerHTML.length).catch(() => 0);

      console.log(`[prerender] DEBUG for ${route}:`);
      console.log(`  - Page title: "${pageTitle}"`);
      console.log(`  - All <title> tags: ${JSON.stringify(allTitles)}`);
      console.log(`  - Meta desc (helmet): "${metaDescHelmet ? metaDescHelmet.substring(0, 60) + '...' : 'NOT FOUND'}"`);
      console.log(`  - Meta desc (regular): "${metaDescRegular ? metaDescRegular.substring(0, 60) + '...' : 'NOT FOUND'}"`);
      console.log(`  - #root innerHTML length: ${hasContent} chars`);

      let html = await page.content();

      if (html.includes('Cannot GET') || html.includes('<title>Error</title>')) {
        console.error(`[prerender] ERROR: Failed to render ${route}`);
        continue;
      }

      // Проверка: если title всё ещё дефолтный - предупреждаем
      if (pageTitle === 'DokSkenas' || pageTitle === 'DokSkenas app') {
        console.warn(`[prerender] ⚠️  WARNING: ${route} has default title! Check Helmet in this component.`);
      }

      html = cleanHtml(html);
      html = addLoader(html);

      const folderName = route === '/' ? '_home' : route.replace(/^\//, '');
      const outPath = path.join(distDir, folderName, 'index.html');

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html, 'utf-8');

      console.log(`[prerender] ✓ Saved: ${outPath}`);
    }

    console.log('\n[prerender] ========== DONE ==========');
  } catch (err) {
    console.error('[prerender] Error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

prerender();



// // prerender.mjs
// import fs from 'fs';
// import path from 'path';
// import express from 'express';
// import puppeteer from 'puppeteer';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const routesToPrerender = [
//   '/',                      
//   '/2025',                      
//   '/saskaitu-skaitmenizavimas-dokskenas',
//   '/pvm-skaiciuokle',
//   '/gpm-skaiciuokle',
//   '/buhalterine-apskaita',
//   '/suma-zodziais',
//   '/saskaita-faktura',
//   '/naudojimo-gidas',
//   '/susisiekti',
//   '/privatumo-politika',
//   '/naudojimo-taisykles',
//   '/b1',
//   '/rivile',
// ];

// const distDir = path.resolve(__dirname, 'dist');
// const port = 4173;

// const loaderStyles = `
// <style id="prerender-loader-styles">
//   .prerender-loader {
//     position: fixed;
//     top: 0;
//     left: 0;
//     right: 0;
//     bottom: 0;
//     background: #fafafa;
//     display: flex;
//     flex-direction: column;
//     align-items: center;
//     justify-content: center;
//     z-index: 99999;
//     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
//   }
//   .prerender-loader-spinner {
//     width: 48px;
//     height: 48px;
//     border: 4px solid #e0e0e0;
//     border-top-color: #1976d2;
//     border-radius: 50%;
//     animation: prerender-spin 1s linear infinite;
//   }
//   .prerender-loader-text {
//     margin-top: 16px;
//     color: #666;
//     font-size: 14px;
//   }
//   @keyframes prerender-spin {
//     to { transform: rotate(360deg); }
//   }
// </style>
// `;

// const loaderHtml = `
// <div class="prerender-loader" id="prerender-loader">
//   <div class="prerender-loader-spinner"></div>
//   <div class="prerender-loader-text">Kraunama...</div>
// </div>

// `;

// async function startServer() {
//   const app = express();
//   app.use(express.static(distDir));

//   app.use((req, res) => {
//     res.sendFile(path.join(distDir, 'index.html'));
//   });

//   return new Promise((resolve) => {
//     const server = app.listen(port, () => {
//       console.log(`[prerender] Static server on http://localhost:${port}`);
//       resolve(server);
//     });
//   });
// }

// function cleanHtml(html) {
//   html = html.replace(/<title>DokSkenas<\/title>/g, '');
//   html = html.replace(/<title>DokSkenas app<\/title>/g, '');
  
//   html = html.replace(
//     /<meta name="description" content="[^"]*"(?! data-react-helmet)\s*\/?>/g,
//     ''
//   );

//   html = html.replace(/<script[^>]*connect\.facebook\.net[^>]*><\/script>/g, '');

//   html = html.replace(/<script[^>]*googletagmanager\.com[^>]*><\/script>/g, '');
  
//   html = html.replace(/\n\s*\n/g, '\n');
  
//   return html;
// }

// function addLoader(html) {
//   html = html.replace('</head>', loaderStyles + '</head>');
//   html = html.replace(/<body([^>]*)>/, '<body$1>' + loaderHtml);
//   return html;
// }

// async function prerender() {
//   if (!fs.existsSync(distDir)) {
//     console.error('[prerender] dist/ not found. Run `npm run build` first.');
//     process.exit(1);
//   }

//   const server = await startServer();
//   const browser = await puppeteer.launch({
//     headless: 'new',
//     args: ['--no-sandbox', '--disable-setuid-sandbox'],
//   });

//   try {
//     const page = await browser.newPage();

//     for (const route of routesToPrerender) {
//       const url = `http://localhost:${port}${route}`;
//       console.log(`[prerender] Rendering ${url} ...`);

//       await page.goto(url, {
//         waitUntil: 'domcontentloaded',
//         timeout: 30000,
//       });

//       await new Promise((resolve) => setTimeout(resolve, 5000));

//       let html = await page.content();

//       if (html.includes('Cannot GET') || html.includes('<title>Error</title>')) {
//         console.error(`[prerender] ERROR: Failed to render ${route}`);
//         continue;
//       }

//       html = cleanHtml(html);
//       html = addLoader(html);

//       const folderName = route === '/' ? '_home' : route.replace(/^\//, '');
//       const outPath = path.join(distDir, folderName, 'index.html');

//       fs.mkdirSync(path.dirname(outPath), { recursive: true });
//       fs.writeFileSync(outPath, html, 'utf-8');

//       console.log(`[prerender] Saved: ${outPath}`);
//     }

//     console.log('[prerender] Done.');
//   } catch (err) {
//     console.error('[prerender] Error:', err);
//     process.exitCode = 1;
//   } finally {
//     await browser.close();
//     server.close();
//   }
// }

// prerender();