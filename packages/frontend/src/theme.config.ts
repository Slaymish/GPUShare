/**
 * Theme Configuration — Claude-inspired warm light palette
 *
 * Primary palette:
 *   Crail     #C15F3C  (terracotta accent)
 *   Cloudy    #B1ADA1  (warm gray)
 *   Pampas    #F4F3EE  (warm off-white background)
 *   White     #FFFFFF  (cards / surfaces)
 */

export const theme = {
  // Application branding
  branding: {
    appName: "GPUShare",
    tagline: "Shared GPU inference & rendering",
  },

  // Color palette
  colors: {
    // Primary brand color
    primary: {
      DEFAULT: "#C15F3C",
      hover: "#A84E30",
      light: "#D4836A",
    },

    // Success states
    success: {
      DEFAULT: "#2E7D32",
      hover: "#1B5E20",
      bg: "#E8F5E9",
      text: "#2E7D32",
    },

    // Error states
    error: {
      DEFAULT: "#C62828",
      hover: "#B71C1C",
      bg: "#FFEBEE",
      text: "#C62828",
    },

    // Warning states
    warning: {
      DEFAULT: "#E65100",
      hover: "#BF360C",
      bg: "#FFF3E0",
      text: "#E65100",
    },

    // Info/secondary
    info: {
      DEFAULT: "#5E35B1",
      hover: "#4527A0",
      bg: "#EDE7F6",
      text: "#5E35B1",
    },

    // Background colors
    background: {
      primary: "#F4F3EE",   // Pampas
      secondary: "#FFFFFF",  // White cards
      tertiary: "#EDEAE3",   // Subtle input bg
      elevated: "#FFFFFF",   // Sidebar
    },

    // Text colors
    text: {
      primary: "#2D2B28",
      secondary: "#6F6B66",
      tertiary: "#8A8580",
      muted: "#B1ADA1",     // Cloudy
      disabled: "#C8C4BC",
    },

    // Border colors
    border: {
      DEFAULT: "#E5E1DB",
      light: "#EDEBE6",
      dark: "#D5D0C8",
    },
  },

  // Typography
  typography: {
    fontFamily: {
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    fontSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
    },
  },

  // Spacing & sizing
  spacing: {
    sidebarWidth: "16rem",
    mobileSidebarWidth: "18rem",
    mobileTopBarHeight: "3.5rem",
    mobileBottomBarHeight: "4rem",
  },

  // Border radius
  borderRadius: {
    sm: "0.375rem",
    DEFAULT: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px",
  },

  // Shadows
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
    DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.06), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
  },

  // Transitions
  transitions: {
    fast: "150ms",
    DEFAULT: "200ms",
    slow: "300ms",
  },

  // Status indicators
  status: {
    online: {
      color: "#2E7D32",
      label: "Online",
      pulse: false,
    },
    warming_up: {
      color: "#E65100",
      label: "Warming up",
      pulse: true,
    },
    degraded: {
      color: "#EF6C00",
      label: "Degraded",
      pulse: false,
    },
    offline: {
      color: "#C62828",
      label: "Offline",
      pulse: false,
    },
  },

  // Balance thresholds (for color coding)
  balanceThresholds: {
    high: 20,
    medium: 10,
    low: 5,
    critical: 0,
  },
} as const;

export type Theme = typeof theme;

export function getThemeValue<T extends keyof Theme>(key: T): Theme[T] {
  return theme[key];
}

export const {
  branding,
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  transitions,
  status,
  balanceThresholds,
} = theme;
