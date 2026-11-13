// Renders brand/src/*.html to PNGs in brand/, light and dark.
// Needs a Chromium: set CHROMIUM_PATH, or it uses an installed Google Chrome.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

const SIZES = {
  banner: { width: 960, height: 400 },
  social: { width: 640, height: 320 },
  tinyfix: { width: 960, height: 400 },
  tinynext: { width: 960, height: 400 },
};

const only = process.argv.slice(2);
const brand = fileURLToPath(new URL(".", import.meta.url));
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: "chrome" });
let count = 0;
for (const [name, viewport] of Object.entries(SIZES)) {
  if (only.length && !only.includes(name)) continue;
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    page.on("pageerror", (error) => console.error(`${name} (${theme}):`, error.message));
    await page.goto(`file://${brand}src/title.html?id=${name}#${theme}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
    await page.screenshot({ path: `${brand}${name}-${theme}.png` });
    await page.close();
    count++;
  }
}
await browser.close();
console.log(`rendered ${count} images to brand/`);
