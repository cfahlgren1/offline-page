import { closeMenu } from "./menu.svelte";
import { closeModelInfo } from "./modelInfo.svelte";
import { settings } from "./settings";

const DRAWER = "(max-width: 899px)";

/** On a narrow screen the sidebar is a drawer over the page; on a wide one it sits beside it. */
export const isDrawer = (): boolean => matchMedia(DRAWER).matches;

const isOpenNow = (): boolean => document.documentElement.dataset.sidebar === "open";

/**
 * Opens or closes the sidebar. The state lives on <html>, where the page's first script puts it before anything is
 * drawn, so the stylesheet can lay the page out without waiting for the app.
 */
export function setSidebar(isOpen: boolean, remember = false): void {
  if (!isOpen) closeModelInfo();
  closeMenu();
  document.documentElement.dataset.sidebar = isOpen ? "open" : "closed";
  if (remember && !isDrawer()) settings.setSidebarOpen(isOpen);
}

export const toggleSidebar = (): void => setSidebar(!isOpenNow(), true);

const followWindowWidth = (): void => setSidebar(!isDrawer() && settings.isSidebarOpen());

/** ⌘\ shows or hides the sidebar, and Escape closes the drawer. */
function onKey(event: KeyboardEvent): void {
  if (event.key === "\\" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    toggleSidebar();
  } else if (event.key === "Escape" && isDrawer() && isOpenNow()) {
    setSidebar(false);
  }
}

/** Keeps the sidebar right as the window crosses between narrow and wide, and handles its keyboard shortcuts. */
export function watchSidebar(): () => void {
  const query = matchMedia(DRAWER);
  query.addEventListener("change", followWindowWidth);
  document.addEventListener("keydown", onKey);
  return () => {
    query.removeEventListener("change", followWindowWidth);
    document.removeEventListener("keydown", onKey);
  };
}
