// Paints a Wi-Fi symbol whose arcs fade out from the center, in grid units. Shared by the hero and social images.
window.paintWifi = function paintWifi(ctx, cx, cy, radius, lums) {
  ctx.lineCap = "round";
  const arcs = lums.length - 1;
  lums.slice(1).forEach((lum, index) => {
    const r = (radius * (index + 1)) / arcs;
    ctx.strokeStyle = `rgb(${lum * 255},${lum * 255},${lum * 255})`;
    ctx.lineWidth = radius / (arcs * 2.6);
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  });
  ctx.fillStyle = `rgb(${lums[0] * 255},${lums[0] * 255},${lums[0] * 255})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius / (arcs * 2.2), 0, Math.PI * 2);
  ctx.fill();
};
