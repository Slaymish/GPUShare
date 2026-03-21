/**
 * Theme Configuration
 *
 * This file contains all customizable theme values for the GPUShare frontend.
 * Modify these values to customize the look and feel of your instance.
 */

export const theme = {
  // Application branding
  branding: {
    appName: "GPUShare",
    tagline: "Shared GPU inference & rendering",
  },

  // Color palette
  colors: {
    // Primary brand color (used for buttons, links, active states)
    primary: {
      DEFAULT: "#2563eb", // blue-600
      hover: "#1d4ed8", // blue-700
      light: "#60a5fa", // blue-400
    },

    // Success states
    success: {
      DEFAULT: "#22c55e", // green-500
      hover: "#16a34a", // green-600
      bg: "#14532d", // green-900
      text: "#4ade80", // green-400
    },

    // Error states
    error: {
      DEFAULT: "#ef4444", // red-500
      hover: "#dc2626", // red-600
      bg: "#7f1d1d", // red-900
      text: "#f87171", // red-400
    },

    // Warning states
    warning: {
      DEFAULT: "#f59e0b", // yellow-500
      hover: "#d97706", // yellow-600
      bg: "#78350f", // yellow-900
      text: "#fbbf24", // yellow-400
    },

    // Info/secondary
    info: {
      DEFAULT: "#8b5cf6", // purple-500
      hover: "#7c3aed", // purple-600
      bg: "#581c87", // purple-900
      text: "#a78bfa", // purple-400
    },

    // Background colors
    background: {
      primary: "#111827", // gray-900
      secondary: "#1f2937", // gray-800
      tertiary: "#374151", // gray-700
      elevated: "#030712", // gray-950
    },

    // Text colors
    text: {
      primary: "#ffffff",
      secondary: "#d1d5db", // gray-300
      tertiary: "#9ca3af", // gray-400
      muted: "#6b7280", // gray-500
      disabled: "#4b5563", // gray-600
    },

    // Border colors
    border: {
      DEFAULT: "#374151", // gray-700
      light: "#4b5563", // gray-600
      dark: "#1f2937", // gray-800
    },
  },

  // Typography
  typography: {
    fontFamily: {
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    fontSize: {
      xs: "0.75rem", // 12px
      sm: "0.875rem", // 14px
      base: "1rem", // 16px
      lg: "1.125rem", // 18px
      xl: "1.25rem", // 20px
      "2xl": "1.5rem", // 24px
      "3xl": "1.875rem", // 30px
      "4xl": "2.25rem", // 36px
    },
  },

  // Spacing & sizing
  spacing: {
    sidebarWidth: "16rem", // 256px (w-64)
    mobileSidebarWidth: "18rem", // 288px (w-72)
    mobileTopBarHeight: "3.5rem", // 56px
    mobileBottomBarHeight: "4rem", // 64px
  },

  // Border radius
  borderRadius: {
    sm: "0.375rem", // 6px
    DEFAULT: "0.5rem", // 8px
    lg: "0.75rem", // 12px
    xl: "1rem", // 16px
    full: "9999px",
  },

  // Shadows
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
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
      color: "#22c55e", // green-500
      label: "Online",
      pulse: false,
    },
    warming_up: {
      color: "#eab308", // yellow-500
      label: "Warming up",
      pulse: true,
    },
    degraded: {
      color: "#f97316", // orange-500
      label: "Degraded",
      pulse: false,
    },
    offline: {
      color: "#ef4444", // red-500
      label: "Offline",
      pulse: false,
    },
  },

  // Balance thresholds (for color coding)
  balanceThresholds: {
    high: 20, // Green above this
    medium: 10, // Yellow above this
    low: 5, // Orange above this
    critical: 0, // Red at or below this
  },
} as const;

export type Theme = typeof theme;

// Helper function to get theme value
export function getThemeValue<T extends keyof Theme>(key: T): Theme[T] {
  return theme[key];
}

// Export individual sections for convenience
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
