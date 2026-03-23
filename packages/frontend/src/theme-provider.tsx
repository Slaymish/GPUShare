import { createContext, useContext, useState, useEffect } from "react";
import { theme, themeColors, type ThemeName } from "./theme.config";

interface ThemeContextValue {
  activeTheme: ThemeName;
  setActiveTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  activeTheme: "default",
  setActiveTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyThemeColors(name: ThemeName) {
  const root = document.documentElement;
  const c = themeColors[name];

  root.setAttribute("data-theme", name);

  root.style.setProperty("--color-primary", c.primary.DEFAULT);
  root.style.setProperty("--color-primary-hover", c.primary.hover);
  root.style.setProperty("--color-primary-light", c.primary.light);

  root.style.setProperty("--color-success", c.success.DEFAULT);
  root.style.setProperty("--color-success-hover", c.success.hover);
  root.style.setProperty("--color-success-bg", c.success.bg);
  root.style.setProperty("--color-success-text", c.success.text);

  root.style.setProperty("--color-error", c.error.DEFAULT);
  root.style.setProperty("--color-error-hover", c.error.hover);
  root.style.setProperty("--color-error-bg", c.error.bg);
  root.style.setProperty("--color-error-text", c.error.text);

  root.style.setProperty("--color-warning", c.warning.DEFAULT);
  root.style.setProperty("--color-warning-hover", c.warning.hover);
  root.style.setProperty("--color-warning-bg", c.warning.bg);
  root.style.setProperty("--color-warning-text", c.warning.text);

  root.style.setProperty("--color-info", c.info.DEFAULT);
  root.style.setProperty("--color-info-hover", c.info.hover);
  root.style.setProperty("--color-info-bg", c.info.bg);
  root.style.setProperty("--color-info-text", c.info.text);

  root.style.setProperty("--color-bg-primary", c.background.primary);
  root.style.setProperty("--color-bg-secondary", c.background.secondary);
  root.style.setProperty("--color-bg-tertiary", c.background.tertiary);
  root.style.setProperty("--color-bg-elevated", c.background.elevated);

  root.style.setProperty("--color-text-primary", c.text.primary);
  root.style.setProperty("--color-text-secondary", c.text.secondary);
  root.style.setProperty("--color-text-tertiary", c.text.tertiary);
  root.style.setProperty("--color-text-muted", c.text.muted);
  root.style.setProperty("--color-text-disabled", c.text.disabled);

  root.style.setProperty("--color-border", c.border.DEFAULT);
  root.style.setProperty("--color-border-light", c.border.light);
  root.style.setProperty("--color-border-dark", c.border.dark);

  // Update theme-color meta tag
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", c.background.primary);
  }
}

/**
 * ThemeProvider component
 * Injects theme CSS variables into the document root and provides
 * a context for switching between palettes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const stored = (localStorage.getItem("gpushare_theme") ?? "default") as ThemeName;
  const [activeTheme, setActiveThemeState] = useState<ThemeName>(stored);

  const setActiveTheme = (name: ThemeName) => {
    setActiveThemeState(name);
    localStorage.setItem("gpushare_theme", name);
    applyThemeColors(name);
  };

  useEffect(() => {
    const root = document.documentElement;

    // Update document title
    document.title = theme.branding.appName;

    // Apply color palette
    applyThemeColors(activeTheme);

    // Typography
    root.style.setProperty("--font-sans", theme.typography.fontFamily.sans);
    root.style.setProperty("--font-mono", theme.typography.fontFamily.mono);

    // Spacing
    root.style.setProperty("--sidebar-width", theme.spacing.sidebarWidth);
    root.style.setProperty("--mobile-sidebar-width", theme.spacing.mobileSidebarWidth);
    root.style.setProperty("--mobile-topbar-height", theme.spacing.mobileTopBarHeight);
    root.style.setProperty("--mobile-bottombar-height", theme.spacing.mobileBottomBarHeight);

    // Border radius
    root.style.setProperty("--radius-sm", theme.borderRadius.sm);
    root.style.setProperty("--radius", theme.borderRadius.DEFAULT);
    root.style.setProperty("--radius-lg", theme.borderRadius.lg);
    root.style.setProperty("--radius-xl", theme.borderRadius.xl);

    // Transitions
    root.style.setProperty("--transition-fast", theme.transitions.fast);
    root.style.setProperty("--transition", theme.transitions.DEFAULT);
    root.style.setProperty("--transition-slow", theme.transitions.slow);

    // Status colors
    root.style.setProperty("--status-online", theme.status.online.color);
    root.style.setProperty("--status-warming-up", theme.status.warming_up.color);
    root.style.setProperty("--status-degraded", theme.status.degraded.color);
    root.style.setProperty("--status-offline", theme.status.offline.color);
  }, []);

  return (
    <ThemeContext.Provider value={{ activeTheme, setActiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
