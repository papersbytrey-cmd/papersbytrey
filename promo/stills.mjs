import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const [tlPath, outDir, ...times] = process.argv.slice(2);
const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
await page.goto('http://127.0.0.1:8765/index.html');
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
await page.evaluate((t) => { window.noFade = true; return window.init(t); }, tl);
fs.mkdirSync(outDir, { recursive: true });
for (const t of times) {
  const s = Date.now();
  const url = await page.evaluate((t) => window.renderFrame(t), +t);
  fs.writeFileSync(`${outDir}/t${t}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.error(t, Date.now() - s, 'ms');
}
await browser.close();
