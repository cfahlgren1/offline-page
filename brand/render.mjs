// Renders brand/src/*.html to PNGs in brand/, light and dark.
// Needs a Chromium: set CHROMIUM_PATH, or it uses an installed Google Chrome.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

const SIZES = {
  banner: { width: 880, height: 352 },
  social: { width: 640, height: 320 },
  tinyfix: { width: 880, height: 352 },
  tinynext: { width: 880, height: 352 },
};

const brand = fileURLToPath(new URL(".", import.meta.url));
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: "chrome" });
for (const [name, viewport] of Object.entries(SIZES)) {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    await page.goto(`file://${brand}src/${name}.html#${theme}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${brand}${name}-${theme}.png` });
    await page.close();
  }
}
await browser.close();
console.log(`rendered ${Object.keys(SIZES).length * 2} images to brand/`);
