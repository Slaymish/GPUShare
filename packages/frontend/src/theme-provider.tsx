import { useEffect } from "react";
import { theme } from "./theme.config";

/**
 * ThemeProvider component
 * Injects theme CSS variables into the document root
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;

    // Update document title
    document.title = theme.branding.appName;

    // Update theme-color meta tag
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", theme.colors.background.primary);
    }

    // Primary colors
    root.style.setProperty("--color-primary", theme.colors.primary.DEFAULT);
    root.style.setProperty("--color-primary-hover", theme.colors.primary.hover);
    root.style.setProperty("--color-primary-light", theme.colors.primary.light);

    // Success colors
    root.style.setProperty("--color-success", theme.colors.success.DEFAULT);
    root.style.setProperty("--color-success-hover", theme.colors.success.hover);
    root.style.setProperty("--color-success-bg", theme.colors.success.bg);
    root.style.setProperty("--color-success-text", theme.colors.success.text);

    // Error colors
    root.style.setProperty("--color-error", theme.colors.error.DEFAULT);
    root.style.setProperty("--color-error-hover", theme.colors.error.hover);
    root.style.setProperty("--color-error-bg", theme.colors.error.bg);
    root.style.setProperty("--color-error-text", theme.colors.error.text);

    // Warning colors
    root.style.setProperty("--color-warning", theme.colors.warning.DEFAULT);
    root.style.setProperty("--color-warning-hover", theme.colors.warning.hover);
    root.style.setProperty("--color-warning-bg", theme.colors.warning.bg);
    root.style.setProperty("--color-warning-text", theme.colors.warning.text);

    // Info colors
    root.style.setProperty("--color-info", theme.colors.info.DEFAULT);
    root.style.setProperty("--color-info-hover", theme.colors.info.hover);
    root.style.setProperty("--color-info-bg", theme.colors.info.bg);
    root.style.setProperty("--color-info-text", theme.colors.info.text);

    // Background colors
    root.style.setProperty(
      "--color-bg-primary",
      theme.colors.background.primary,
    );
    root.style.setProperty(
      "--color-bg-secondary",
      theme.colors.background.secondary,
    );
    root.style.setProperty(
      "--color-bg-tertiary",
      theme.colors.background.tertiary,
    );
    root.style.setProperty(
      "--color-bg-elevated",
      theme.colors.background.elevated,
    );

    // Text colors
    root.style.setProperty("--color-text-primary", theme.colors.text.primary);
    root.style.setProperty(
      "--color-text-secondary",
      theme.colors.text.secondary,
    );
    root.style.setProperty("--color-text-tertiary", theme.colors.text.tertiary);
    root.style.setProperty("--color-text-muted", theme.colors.text.muted);
    root.style.setProperty("--color-text-disabled", theme.colors.text.disabled);

    // Border colors
    root.style.setProperty("--color-border", theme.colors.border.DEFAULT);
    root.style.setProperty("--color-border-light", theme.colors.border.light);
    root.style.setProperty("--color-border-dark", theme.colors.border.dark);

    // Typography
    root.style.setProperty("--font-sans", theme.typography.fontFamily.sans);
    root.style.setProperty("--font-mono", theme.typography.fontFamily.mono);

    // Spacing
    root.style.setProperty("--sidebar-width", theme.spacing.sidebarWidth);
    root.style.setProperty(
      "--mobile-sidebar-width",
      theme.spacing.mobileSidebarWidth,
    );
    root.style.setProperty(
      "--mobile-topbar-height",
      theme.spacing.mobileTopBarHeight,
    );
    root.style.setProperty(
      "--mobile-bottombar-height",
      theme.spacing.mobileBottomBarHeight,
    );

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
    root.style.setProperty(
      "--status-warming-up",
      theme.status.warming_up.color,
    );
    root.style.setProperty("--status-degraded", theme.status.degraded.color);
    root.style.setProperty("--status-offline", theme.status.offline.color);
  }, []);

  return <>{children}</>;
}
