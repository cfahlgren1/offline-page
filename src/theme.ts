const THEME_KEY = "offline.page/theme";

type Theme = "light" | "dark";

function readTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Dark mode follows the system until the button is used; after that the choice is remembered. The button's label says
 * what a click would switch to.
 */
export function setupTheme(button: HTMLButtonElement, onChosen: () => void): void {
  const apply = (theme: Theme | null): void => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    button.textContent = isDark() ? "Light mode" : "Dark mode";
  };
  apply(readTheme());
  button.addEventListener("click", () => {
    const next: Theme = isDark() ? "light" : "dark";
    apply(next);
    localStorage.setItem(THEME_KEY, next);
    onChosen();
  });
}
