const THEME_KEY = "offline.page/theme";

type Theme = "light" | "dark";

/** Whether the page is dark right now. Dark mode follows the system until the menu's button is used. */
export const theme = $state({ dark: false });

function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Reads the theme the page's first script already applied. */
export function readTheme(): void {
  theme.dark = isDark();
}

/** Switches between light and dark, and remembers the choice. */
export function toggleTheme(): void {
  const next: Theme = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  theme.dark = next === "dark";
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (error) {
    console.error("Couldn’t remember the theme", error);
  }
}
