export type AppTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "yakebda-ms.theme";

function isAppTheme(value: string | null | undefined): value is AppTheme {
  return value === "light" || value === "dark";
}

function readStoredTheme(): AppTheme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function readSystemTheme(): AppTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveInitialTheme(): AppTheme {
  return readStoredTheme() ?? readSystemTheme();
}

export function getActiveTheme(): AppTheme {
  const current = document.documentElement.dataset.theme;
  return isAppTheme(current) ? current : resolveInitialTheme();
}

export function applyTheme(theme: AppTheme, persist = true): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  if (!persist) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for the current session when storage is unavailable.
  }
}

export function initializeTheme(): AppTheme {
  const theme = resolveInitialTheme();
  applyTheme(theme, false);
  return theme;
}
