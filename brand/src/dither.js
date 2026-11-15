// Ordered (Bayer 8×8) dithering onto a canvas. Classic script, because ES modules don't load over file://.
// paint(ctx, grid) draws luminance in white on black at grid resolution; each lit grid cell becomes one square "pixel".
(function () {
  const BAYER = [
    [0, 48, 12, 60, 3, 51, 15, 63],
    [32, 16, 44, 28, 35, 19, 47, 31],
    [8, 56, 4, 52, 11, 59, 7, 55],
    [40, 24, 36, 20, 43, 27, 39, 23],
    [2, 50, 14, 62, 1, 49, 13, 61],
    [34, 18, 46, 30, 33, 17, 45, 29],
    [10, 58, 6, 54, 9, 57, 5, 53],
    [42, 26, 38, 22, 41, 25, 37, 21],
  ];

  // supersample draws the shape bigger first and shrinks it, so thin strokes become partly lit cells instead of gaps.
  window.dither = function dither(canvas, paint, { cell = 4, gap = 0.75, color = "#fff", supersample = 4 } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const grid = { width: Math.ceil(width / cell), height: Math.ceil(height / cell), cell, x: (px) => px / cell };
    const large = document.createElement("canvas");
    large.width = grid.width * supersample;
    large.height = grid.height * supersample;
    const l = large.getContext("2d");
    l.fillStyle = "#000";
    l.fillRect(0, 0, large.width, large.height);
    l.scale(supersample, supersample);
    l.fillStyle = "#fff";
    paint(l, grid);
    const source = document.createElement("canvas");
    source.width = grid.width;
    source.height = grid.height;
    const s = source.getContext("2d", { willReadFrequently: true });
    s.imageSmoothingEnabled = true;
    s.imageSmoothingQuality = "high";
    s.drawImage(large, 0, 0, grid.width, grid.height);
    const pixels = s.getImageData(0, 0, grid.width, grid.height).data;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const lum = pixels[(y * grid.width + x) * 4] / 255;
        if (lum <= (BAYER[y % 8][x % 8] + 0.5) / 64) continue;
        ctx.fillStyle = typeof color === "function" ? color(x / grid.width, y / grid.height) : color;
        ctx.fillRect(x * cell, y * cell, cell - gap, cell - gap);
      }
    }
  };

  /** A white-to-black linear gradient in grid units, for fading a shape out. */
  window.fade = (ctx, x0, y0, x1, y1, stops) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([at, lum]) => g.addColorStop(at, `rgb(${lum * 255},${lum * 255},${lum * 255})`));
    return g;
  };
  window.glow = (ctx, cx, cy, r, peak) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgb(${peak * 255},${peak * 255},${peak * 255})`);
    g.addColorStop(1, "#000");
    return g;
  };
  window.theme = location.hash === "#dark" ? "dark" : "light";
  document.documentElement.classList.toggle("dark", window.theme === "dark");
})();

// Fills the grid from fn(u, v, px, py) → 0..1, where u, v are 0..1 across the image and px, py are CSS pixels.
window.paintField = function paintField(ctx, grid, fn) {
  const image = ctx.createImageData(grid.width, grid.height);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const lum = Math.max(0, Math.min(1, fn(x / grid.width, y / grid.height, x * grid.cell, y * grid.cell)));
      const i = (y * grid.width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = lum * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

window.smoothstep = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
