import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // TYPE 1 HSL-fragment tokens — use `hsl(var(--x) / <alpha-value>)` so
        // bg-border/60, bg-accent/20, etc. produce real opacity. Plain
        // bg-border substitutes <alpha-value> with 1.
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Finance-specific semantic colors
        positive: {
          DEFAULT: 'hsl(var(--positive))',
          foreground: 'hsl(var(--positive-foreground))',
        },
        negative: {
          DEFAULT: 'hsl(var(--negative))',
          foreground: 'hsl(var(--negative-foreground))',
        },
        // Editorial surfaces — warm canvas / elevated card / sunken row.
        // <alpha-value> enables bg-surface-sunken/40 etc.
        'surface-paper': 'hsl(var(--surface-paper) / <alpha-value>)',
        'surface-elevated': 'hsl(var(--surface-elevated) / <alpha-value>)',
        'surface-sunken': 'hsl(var(--surface-sunken) / <alpha-value>)',
        // Semantic colors — TYPE 2 hex tokens. Registered for bare-class
        // usage (border-semantic-caution, text-semantic-danger). Opacity
        // suffixes (/N) don't apply through Tailwind's pipeline for hex
        // sources — use inline color-mix at call sites that need alpha.
        'semantic-success': 'var(--semantic-success)',
        'semantic-caution': 'var(--semantic-caution)',
        'semantic-danger': 'var(--semantic-danger)',
        'semantic-info': 'var(--semantic-info)',
        // Hairline divider tokens — already complete rgba() values in
        // globals.css, so no hsl() wrap. Used as `border-hairline`,
        // `border-hairline-strong`, `divide-hairline`, etc.
        hairline: 'var(--hairline)',
        'hairline-strong': 'var(--hairline-strong)',
        // Editorial neutral text — quiet hierarchy below `foreground`.
        // TYPE 2 complete-color tokens (rgba/var) so no hsl() wrap.
        // Used as text-text-2, text-text-3, border-text-3.
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        // Editorial canvas tokens — the layer below paper/elevated/sunken.
        // Used as bg-surface (raw canvas) and hover:bg-bg-2 (hover row).
        surface: 'var(--surface)',
        'bg-2': 'var(--bg-2)',
        // Chart palette — brand-tinted earth/green family for multi-line
        // viz. See globals.css for the hue rationale.
        'chart-1': 'hsl(var(--chart-1))',
        'chart-2': 'hsl(var(--chart-2))',
        'chart-3': 'hsl(var(--chart-3))',
        'chart-4': 'hsl(var(--chart-4))',
        'chart-5': 'hsl(var(--chart-5))',
        'chart-6': 'hsl(var(--chart-6))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: 'var(--radius-card)',
        pill: 'var(--radius-pill)',
        // Button radius — slightly tighter than card; --r-btn is 6px.
        // Used as `rounded-btn` across simulator forms + ui/select trigger.
        btn: 'var(--r-btn)',
      },
      backgroundImage: {
        'gradient-hero': 'var(--gradient-hero)',
      },
      transitionTimingFunction: {
        'out-quart': 'var(--ease-out-quart)',
        'in-out-quart': 'var(--ease-in-out-quart)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
        // --font-display aliases --font-serif (Fraunces) for page-title
        // semantics. The 11 `font-display italic` page-title h1 elements
        // depend on this mapping; commit 456f6b5 added the classes without
        // ever wiring `display` into Tailwind, so the Fraunces sweep was
        // silently no-op until this commit.
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
