/** The ⋯ menu's place on screen. It opens under whichever ⋯ button was pressed: the sidebar's or the spine's. */
export const menu = $state({ open: false, top: 0, left: 0 });

export function closeMenu(): void {
  menu.open = false;
}

export function toggleMenu(from: HTMLElement): void {
  if (menu.open) return closeMenu();
  const box = from.getBoundingClientRect();
  menu.top = box.bottom + 6;
  menu.left = Math.max(8, box.left - 4);
  menu.open = true;
}
