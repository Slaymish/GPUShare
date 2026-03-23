/**
 * Theme Configuration
 *
 * Three palettes:
 *   default  — Warm terracotta (Crail #C15F3C, Pampas #F4F3EE)
 *   light    — Cool blue/slate (#2563EB, #F8FAFC)
 *   dark     — Dark violet/slate (#8B5CF6, #0F172A)
 */

export type ThemeName = "default" | "light" | "dark";

export interface ThemeColors {
  primary: { DEFAULT: string; hover: string; light: string };
  success: { DEFAULT: string; hover: string; bg: string; text: string };
  error: { DEFAULT: string; hover: string; bg: string; text: string };
  warning: { DEFAULT: string; hover: string; bg: string; text: string };
  info: { DEFAULT: string; hover: string; bg: string; text: string };
  background: { primary: string; secondary: string; tertiary: string; elevated: string };
  text: { primary: string; secondary: string; tertiary: string; muted: string; disabled: string };
  border: { DEFAULT: string; light: string; dark: string };
}

export const themeColors: Record<ThemeName, ThemeColors> = {
  default: {
    primary: { DEFAULT: "#C15F3C", hover: "#A84E30", light: "#D4836A" },
    success: { DEFAULT: "#2E7D32", hover: "#1B5E20", bg: "#E8F5E9", text: "#2E7D32" },
    error: { DEFAULT: "#C62828", hover: "#B71C1C", bg: "#FFEBEE", text: "#C62828" },
    warning: { DEFAULT: "#E65100", hover: "#BF360C", bg: "#FFF3E0", text: "#E65100" },
    info: { DEFAULT: "#5E35B1", hover: "#4527A0", bg: "#EDE7F6", text: "#5E35B1" },
    background: { primary: "#F4F3EE", secondary: "#FFFFFF", tertiary: "#EDEAE3", elevated: "#FFFFFF" },
    text: { primary: "#2D2B28", secondary: "#6F6B66", tertiary: "#8A8580", muted: "#B1ADA1", disabled: "#C8C4BC" },
    border: { DEFAULT: "#E5E1DB", light: "#EDEBE6", dark: "#D5D0C8" },
  },
  light: {
    primary: { DEFAULT: "#2563EB", hover: "#1D4ED8", light: "#93C5FD" },
    success: { DEFAULT: "#15803D", hover: "#166534", bg: "#F0FDF4", text: "#15803D" },
    error: { DEFAULT: "#DC2626", hover: "#B91C1C", bg: "#FEF2F2", text: "#DC2626" },
    warning: { DEFAULT: "#D97706", hover: "#B45309", bg: "#FFFBEB", text: "#D97706" },
    info: { DEFAULT: "#7C3AED", hover: "#6D28D9", bg: "#F5F3FF", text: "#7C3AED" },
    background: { primary: "#F8FAFC", secondary: "#FFFFFF", tertiary: "#F1F5F9", elevated: "#FFFFFF" },
    text: { primary: "#0F172A", secondary: "#475569", tertiary: "#64748B", muted: "#94A3B8", disabled: "#CBD5E1" },
    border: { DEFAULT: "#E2E8F0", light: "#F1F5F9", dark: "#CBD5E1" },
  },
  dark: {
    primary: { DEFAULT: "#8B5CF6", hover: "#7C3AED", light: "#C4B5FD" },
    success: { DEFAULT: "#4ADE80", hover: "#22C55E", bg: "#052E16", text: "#4ADE80" },
    error: { DEFAULT: "#F87171", hover: "#EF4444", bg: "#450A0A", text: "#F87171" },
    warning: { DEFAULT: "#FB923C", hover: "#F97316", bg: "#431407", text: "#FB923C" },
    info: { DEFAULT: "#A78BFA", hover: "#8B5CF6", bg: "#2E1065", text: "#A78BFA" },
    background: { primary: "#0F172A", secondary: "#1E293B", tertiary: "#1E293B", elevated: "#1E293B" },
    text: { primary: "#F8FAFC", secondary: "#CBD5E1", tertiary: "#94A3B8", muted: "#64748B", disabled: "#475569" },
    border: { DEFAULT: "#334155", light: "#1E293B", dark: "#475569" },
  },
};

export const theme = {
  // Application branding
  branding: {
    appName: "GPUShare",
    tagline: "Shared GPU inference & rendering",
  },

  // Color palette (default — kept for backwards compatibility)
  colors: themeColors.default,

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
    online: { color: "#2E7D32", label: "Online", pulse: false },
    warming_up: { color: "#E65100", label: "Warming up", pulse: true },
    degraded: { color: "#EF6C00", label: "Degraded", pulse: false },
    offline: { color: "#C62828", label: "Offline", pulse: false },
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

export const THEME_LABELS: Record<ThemeName, string> = {
  default: "Warm (Default)",
  light: "Cool Light",
  dark: "Dark",
};
