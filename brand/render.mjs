// Renders the brand images in brand/src/ (title.html, and example.html for the model cards' pictures) to PNGs in brand/.
// Needs a Chromium: set CHROMIUM_PATH, or it uses an installed Google Chrome.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

const SIZES = {
  banner: { width: 960, height: 400 },
  social: { width: 640, height: 320 },
  // The link preview that offlinepage.app serves, at the 1200x630 size social sites expect.
  og: { width: 600, height: 315 },
  tinyfix: { width: 960, height: 400 },
  tinynext: { width: 960, height: 400 },
  // The "what it does" pictures on the two model cards.
  "tinyfix-example": { width: 880, height: 380, page: "example.html" },
  "tinynext-example": { width: 880, height: 380, page: "example.html" },
};

const only = process.argv.slice(2);
const brand = fileURLToPath(new URL(".", import.meta.url));
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: "chrome" });
let count = 0;
for (const [name, { page: template = "title.html", ...viewport }] of Object.entries(SIZES)) {
  if (only.length && !only.includes(name)) continue;
  for (const theme of ["light"]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
    page.on("pageerror", (error) => console.error(`${name} (${theme}):`, error.message));
    await page.goto(`file://${brand}src/${template}?id=${name}#${theme}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
    await page.screenshot({ path: `${brand}${name}.png` });
    await page.close();
    count++;
  }
}
await browser.close();
console.log(`rendered ${count} images to brand/`);
