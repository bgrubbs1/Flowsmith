// Records the scripted demo in a real Chromium with the Quest 3 emulator, and saves screenshots.
// Usage: npm run build && npm run capture   (needs: npx playwright install chromium; ffmpeg optional)
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('capture');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 4173;
const server = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 2500));
const url = `http://localhost:${PORT}/?emulate&vr&director`;
const browser = await chromium.launch({
  headless: false,
  args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--window-size=1920,1080'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById('enter').disabled, null, { timeout: 30000 });
  await page.click('#enter');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '00-start.png') });
  // Screenshots every 5 s while the demo records, for checking and for the Devpost gallery.
  let n = 1;
  const shots = setInterval(() => page.screenshot({ path: path.join(OUT, `shot-${String(n++).padStart(2, '0')}.png`) }).catch(() => {}), 5000);
  const download = page.waitForEvent('download', { timeout: 10 * 60 * 1000 });
  const size = await page.evaluate(() => window.__startDirector(true));
  clearInterval(shots);
  const dl = await download;
  const webm = path.join(OUT, 'flowsmith-demo.webm');
  await dl.saveAs(webm);
  console.log('Saved', webm, size, 'bytes');
  const fps = await page.evaluate(() => window.__fps?.fps);
  console.log('Frame rate during capture (desktop emulator, not a Quest):', fps?.toFixed?.(1));
  const ff = spawnSync('ffmpeg', ['-y', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '60', '-c:a', 'aac', '-b:a', '192k', path.join(OUT, 'flowsmith-demo.mp4')], { stdio: 'inherit' });
  if (ff.status !== 0) console.log('ffmpeg not found or failed: upload the .webm directly (YouTube accepts it).');
} finally {
  await browser.close();
  server.kill();
}
