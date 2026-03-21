# Theme Customization Guide

This guide explains how to customize the look and feel of your GPUShare frontend instance.

## Quick Start

All theme customization is done through a single file:

```
packages/frontend/src/theme.config.ts
```

Simply edit the values in this file and restart your development server to see the changes.

## Theme Configuration Structure

### Branding

Customize your application's name and tagline:

```typescript
branding: {
  appName: 'GPUShare',           // Appears in header, login page, and browser tab
  tagline: 'Shared GPU inference & rendering',  // Appears on login page
}
```

### Colors

#### Primary Colors

Used for buttons, links, and active states:

```typescript
colors: {
  primary: {
    DEFAULT: '#2563eb',  // Main primary color (blue-600)
    hover: '#1d4ed8',    // Hover state (blue-700)
    light: '#60a5fa',    // Light variant (blue-400)
  },
  // ...
}
```

**Popular alternatives:**

- Purple: `#8b5cf6`, `#7c3aed`, `#a78bfa`
- Green: `#10b981`, `#059669`, `#34d399`
- Orange: `#f97316`, `#ea580c`, `#fb923c`
- Pink: `#ec4899`, `#db2777`, `#f472b6`

#### State Colors

Customize success, error, warning, and info colors:

```typescript
success: {
  DEFAULT: '#22c55e',  // Main success color
  hover: '#16a34a',    // Hover state
  bg: '#14532d',       // Background color
  text: '#4ade80',     // Text color
},
```

#### Background Colors

Control the overall color scheme:

```typescript
background: {
  primary: '#111827',    // Main background (gray-900)
  secondary: '#1f2937',  // Cards and panels (gray-800)
  tertiary: '#374151',   // Inputs and selects (gray-700)
  elevated: '#030712',   // Sidebar (gray-950)
}
```

**Light theme example:**

```typescript
background: {
  primary: '#ffffff',
  secondary: '#f9fafb',
  tertiary: '#f3f4f6',
  elevated: '#f9fafb',
}
```

#### Text Colors

```typescript
text: {
  primary: '#ffffff',     // Main text
  secondary: '#d1d5db',   // Secondary text
  tertiary: '#9ca3af',    // Tertiary text
  muted: '#6b7280',       // Muted text
  disabled: '#4b5563',    // Disabled text
}
```

### Typography

Customize fonts and sizes:

```typescript
typography: {
  fontFamily: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    // ...
  },
}
```

**Custom font example:**

```typescript
fontFamily: {
  sans: '"Inter", system-ui, sans-serif',
  mono: '"Fira Code", monospace',
}
```

### Spacing & Layout

Control sidebar widths and mobile bar heights:

```typescript
spacing: {
  sidebarWidth: '16rem',           // Desktop sidebar (256px)
  mobileSidebarWidth: '18rem',     // Mobile sidebar (288px)
  mobileTopBarHeight: '3.5rem',    // Mobile top bar (56px)
  mobileBottomBarHeight: '4rem',   // Mobile bottom bar (64px)
}
```

### Border Radius

Adjust the roundness of UI elements:

```typescript
borderRadius: {
  sm: '0.375rem',      // Small radius (6px)
  DEFAULT: '0.5rem',   // Default radius (8px)
  lg: '0.75rem',       // Large radius (12px)
  xl: '1rem',          // Extra large (16px)
  full: '9999px',      // Fully rounded
}
```

**Sharp corners:**

```typescript
borderRadius: {
  sm: '0',
  DEFAULT: '0',
  lg: '0',
  xl: '0',
  full: '9999px',
}
```

**Very rounded:**

```typescript
borderRadius: {
  sm: '0.5rem',
  DEFAULT: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  full: '9999px',
}
```

### Status Indicators

Customize server status colors and labels:

```typescript
status: {
  online: {
    color: '#22c55e',    // Green
    label: 'Online',
    pulse: false,        // Whether to animate
  },
  warming_up: {
    color: '#eab308',    // Yellow
    label: 'Warming up',
    pulse: true,
  },
  // ...
}
```

### Balance Thresholds

Control when balance colors change:

```typescript
balanceThresholds: {
  high: 20,      // Green above this amount
  medium: 10,    // Yellow above this amount
  low: 5,        // Orange above this amount
  critical: 0,   // Red at or below this amount
}
```

## Example Themes

### Corporate Blue

```typescript
colors: {
  primary: {
    DEFAULT: '#0066cc',
    hover: '#0052a3',
    light: '#3399ff',
  },
  background: {
    primary: '#0a1929',
    secondary: '#1a2332',
    tertiary: '#2a3342',
    elevated: '#000a14',
  },
}
```

### Vibrant Purple

```typescript
colors: {
  primary: {
    DEFAULT: '#8b5cf6',
    hover: '#7c3aed',
    light: '#a78bfa',
  },
  background: {
    primary: '#1e1b4b',
    secondary: '#312e81',
    tertiary: '#4338ca',
    elevated: '#0f0a2e',
  },
}
```

### Minimal Gray

```typescript
colors: {
  primary: {
    DEFAULT: '#374151',
    hover: '#1f2937',
    light: '#6b7280',
  },
  background: {
    primary: '#ffffff',
    secondary: '#f9fafb',
    tertiary: '#f3f4f6',
    elevated: '#f9fafb',
  },
  text: {
    primary: '#111827',
    secondary: '#374151',
    tertiary: '#6b7280',
    muted: '#9ca3af',
    disabled: '#d1d5db',
  },
}
```

### Cyberpunk Neon

```typescript
colors: {
  primary: {
    DEFAULT: '#ff00ff',
    hover: '#cc00cc',
    light: '#ff66ff',
  },
  background: {
    primary: '#0a0a0a',
    secondary: '#1a1a1a',
    tertiary: '#2a2a2a',
    elevated: '#000000',
  },
}
```

## CSS Variables

The theme system automatically generates CSS variables that you can use in custom styles:

```css
/* Primary colors */
var(--color-primary)
var(--color-primary-hover)
var(--color-primary-light)

/* Success colors */
var(--color-success)
var(--color-success-hover)
var(--color-success-bg)
var(--color-success-text)

/* Error colors */
var(--color-error)
var(--color-error-hover)
var(--color-error-bg)
var(--color-error-text)

/* Background colors */
var(--color-bg-primary)
var(--color-bg-secondary)
var(--color-bg-tertiary)
var(--color-bg-elevated)

/* Text colors */
var(--color-text-primary)
var(--color-text-secondary)
var(--color-text-tertiary)
var(--color-text-muted)
var(--color-text-disabled)

/* Border colors */
var(--color-border)
var(--color-border-light)
var(--color-border-dark)

/* Typography */
var(--font-sans)
var(--font-mono)

/* Spacing */
var(--sidebar-width)
var(--mobile-sidebar-width)
var(--mobile-topbar-height)
var(--mobile-bottombar-height)

/* Border radius */
var(--radius-sm)
var(--radius)
var(--radius-lg)
var(--radius-xl)

/* Transitions */
var(--transition-fast)
var(--transition)
var(--transition-slow)

/* Status colors */
var(--status-online)
var(--status-warming-up)
var(--status-degraded)
var(--status-offline)
```

## Advanced Customization

### Adding Custom CSS

Create a custom CSS file and import it in `src/main.tsx`:

```typescript
import "./app.css";
import "./custom-theme.css"; // Your custom styles
```

### Using Theme Values in Components

Import theme values directly in your components:

```typescript
import { colors, branding } from './theme.config';

function MyComponent() {
  return (
    <div style={{ backgroundColor: colors.primary.DEFAULT }}>
      {branding.appName}
    </div>
  );
}
```

### TypeScript Support

The theme configuration is fully typed. Your IDE will provide autocomplete and type checking:

```typescript
import { theme, type Theme } from "./theme.config";

// Get theme values with type safety
const primaryColor: string = theme.colors.primary.DEFAULT;
```

## Tips

1. **Start Small**: Begin by changing just the primary color and branding
2. **Test Contrast**: Ensure text is readable on all backgrounds
3. **Mobile First**: Test your theme on mobile devices
4. **Consistency**: Use the same color palette throughout
5. **Accessibility**: Maintain WCAG contrast ratios (4.5:1 for normal text)

## Troubleshooting

**Changes not appearing?**

- Restart the development server
- Clear browser cache
- Check for TypeScript errors in the console

**Colors look wrong?**

- Ensure hex colors start with `#`
- Use 6-digit hex codes (e.g., `#ff0000` not `#f00`)

**CSS variables not working?**

- Make sure ThemeProvider is wrapping your app in `main.tsx`
- Check browser console for errors

## Support

For more help with theming, check:

- TailwindCSS color palette: https://tailwindcss.com/docs/customizing-colors
- Color contrast checker: https://webaim.org/resources/contrastchecker/
- Color scheme generator: https://coolors.co/
