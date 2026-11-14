// Desktop and phone camera framing. Landscape keeps the original seated view; as the screen gets taller
// the camera rises and tips down so the board, its title card and the side buttons all stay in frame
// (a phone held upright is about 0.46 wide per unit of height).
export function desktopFraming(aspect, mode, rows) {
  const base = mode === 'menu' ? 1.1 : rows > 4 ? 1.05 : 1.35;
  const t = Math.min(1, Math.max(0, (1.25 - aspect) / 0.75)); // 0 = landscape, 1 = tall portrait
  return {
    position: [0.035 * t, 1.22 + 0.36 * t, 0.32 - 0.2 * t],
    target: [0.035 * t, 0.91 - 0.05 * t, -0.32 + 0.02 * t],
    zoom: base * Math.min(1, aspect / 1.45) * (1 + 0.5 * t),
    portrait: t,
  };
}
