/**
 * KOYO Studio Tailwind config.
 *
 * This file maps semantic utility names onto the CSS custom properties
 * declared in app/globals.css. It must never contain a literal colour,
 * radius, shadow or duration value — globals.css is the only source of truth.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './packages/studio/src/**/*.{js,jsx}',
    './packages/Open-AI-Design-Agent/packages/design-agent/src/**/*.{js,jsx}',
    './packages/Open-Poe-AI/packages/agents/src/**/*.{js,jsx,ts,tsx}',
    './packages/Vibe-Workflow/packages/workflow-builder/src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Surface elevation — dark-first, neutral, content stays the hero
        canvas: 'var(--bg-canvas)',
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        raised: 'var(--bg-surface-raised)',
        overlay: 'var(--bg-overlay)',
        well: 'var(--bg-subtle)',
        'surface-inverse': 'var(--bg-inverse)',
        // The only two permitted translucent surfaces.
        'surface-glass': 'var(--bg-surface-glass)',
        'overlay-glass': 'var(--bg-overlay-glass)',

        // Text hierarchy — "ink" avoids colliding with shadcn's text-primary
        ink: {
          DEFAULT: 'var(--text-primary)',
          muted: 'var(--text-secondary)',
          subtle: 'var(--text-tertiary)',
          disabled: 'var(--text-disabled)',
          inverse: 'var(--text-inverse)',
          'on-accent': 'var(--text-on-accent)',
        },

        // Borders
        line: {
          DEFAULT: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          accent: 'var(--border-accent)',
        },

        // Brand accent — the only saturated colour token in the system
        brand: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-hover)',
          active: 'var(--accent-active)',
          soft: 'var(--accent-soft)',
          pressed: 'var(--accent-pressed)',
          ring: 'var(--accent-ring)',
          line: 'var(--accent-line)',
        },

        // Feedback — every translucent variant is an explicit token,
        // because Tailwind cannot apply /alpha to a var() colour.
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)', line: 'var(--success-line)', mid: 'var(--success-mid)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)', line: 'var(--warning-line)' },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
          hover: 'var(--danger-hover)',
          pressed: 'var(--danger-pressed)',
          line: 'var(--danger-line)',
          ring: 'var(--danger-ring)',
        },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)', line: 'var(--info-line)' },

        // Neutral washes for hover/press on dark surfaces
        wash: {
          DEFAULT: 'var(--hover-neutral)',
          strong: 'var(--hover-neutral-strong)',
          press: 'var(--press-neutral)',
        },

        // Modal / drawer scrim
        scrim: 'var(--scrim)',

        // shadcn / Radix compatibility — resolved from the same variables
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--primary-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',

        // DEPRECATED legacy aliases (8 files still reference bg-app-bg).
        // Resolved from tokens so they can no longer drift; remove with the
        // migration ledger in docs/UI_MIGRATION.md.
        'app-bg': 'var(--bg-canvas)',
        'panel-bg': 'var(--bg-surface)',
        'card-bg': 'var(--bg-surface-raised)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        // Brand wordmark face — retained for the 10 files that use it.
        jost: ['var(--font-jost)', 'Jost', 'var(--font-sans)'],
      },
      fontSize: {
        // Every size, line-height, tracking and weight resolves from
        // globals.css, so this file stays a mapping layer and never a second
        // definition. The weight travels with the size so a title can never
        // be rendered at the wrong weight by forgetting a font-* class;
        // fontWeight generates after fontSize, so an explicit font-* still
        // overrides it when a design calls for it.
        display: ['var(--text-display)', { lineHeight: 'var(--lh-display)', letterSpacing: 'var(--tracking-display)', fontWeight: '700' }],
        'page-title': ['var(--text-page-title)', { lineHeight: 'var(--lh-page-title)', letterSpacing: 'var(--tracking-title)', fontWeight: '600' }],
        'section-title': ['var(--text-section-title)', { lineHeight: 'var(--lh-section-title)', letterSpacing: 'var(--tracking-title)', fontWeight: '600' }],
        'card-title': ['var(--text-card-title)', { lineHeight: 'var(--lh-card-title)', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['var(--text-body)', { lineHeight: 'var(--lh-body)', letterSpacing: 'var(--tracking-body)', fontWeight: '400' }],
        'body-sm': ['var(--text-body-sm)', { lineHeight: 'var(--lh-body-sm)', fontWeight: '400' }],
        label: ['var(--text-label)', { lineHeight: 'var(--lh-label)', letterSpacing: '0.01em', fontWeight: '500' }],
        caption: ['var(--text-caption)', { lineHeight: 'var(--lh-caption)', letterSpacing: '0.015em', fontWeight: '400' }],
        micro: ['var(--text-micro)', { lineHeight: 'var(--lh-micro)', letterSpacing: '0.02em', fontWeight: '400' }],
        mono: ['var(--text-label)', { lineHeight: 'var(--lh-label)', fontFamily: 'var(--font-mono)', fontWeight: '400' }],
      },
      maxHeight: {
        composer: 'var(--composer-max-h)',
        'composer-lg': 'var(--composer-max-h-md)',
        popover: 'var(--popover-max-h)',
        modal: 'var(--modal-max-h)',
        sheet: 'var(--sheet-max-h)',
        drawer: 'var(--drawer-max-h)',
      },
      width: {
        modal: 'var(--modal-w)',
        toast: 'var(--toast-w)',
        sidebar: 'var(--sidebar-w)',
        'sidebar-collapsed': 'var(--sidebar-w-collapsed)',
        panel: 'var(--panel-w)',
      },
      maxWidth: {
        'composer-mobile': 'var(--composer-w-mobile)',
        modal: 'var(--modal-w)',
      },
      minWidth: {
        menu: 'var(--menu-min-w)',
        // Declared after `menu` on purpose: Tailwind emits minWidth keys in
        // object order, and the studio SelectContent already carries
        // `min-w-menu`, so only a later rule can out-emit it.
        'menu-anchor': 'var(--radix-select-trigger-width, var(--menu-min-w))',
        popover: 'var(--popover-min-w)',
      },
      spacing: {
        // Reference the tokens directly. Duplicating them as literal rem
        // values here would mean two definitions of the same contract that
        // can drift apart.
        'space-1': 'var(--space-1)',
        'space-2': 'var(--space-2)',
        'space-3': 'var(--space-3)',
        'space-4': 'var(--space-4)',
        'space-5': 'var(--space-5)',
        'space-6': 'var(--space-6)',
        'space-8': 'var(--space-8)',
        'space-10': 'var(--space-10)',
        'space-12': 'var(--space-12)',
        'space-16': 'var(--space-16)',
        // Control height contract
        'control-xs': 'var(--control-xs)',
        'control-sm': 'var(--control-sm)',
        'control-md': 'var(--control-md)',
        'control-lg': 'var(--control-lg)',
        'header-h': 'var(--header-h)',
        'announcement-h': 'var(--announcement-h)',
        'sidebar-w': 'var(--sidebar-w)',
        'sidebar-collapsed': 'var(--sidebar-w-collapsed)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        // rounded-3xl collapses onto the top of the scale instead of 30px,
        // so the 15 files still using it inherit the token without a rewrite.
        '3xl': 'var(--radius-2xl)',
        composer: 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        'elevation-1': 'var(--elevation-1)',
        'elevation-2': 'var(--elevation-2)',
        'elevation-3': 'var(--elevation-3)',
        'elevation-4': 'var(--elevation-4)',
        'elevation-brand': 'var(--elevation-brand)',
        // Legacy names retained during migration, now glow-free
        subtle: 'var(--elevation-1)',
        card: 'var(--elevation-2)',
        overlay: 'var(--elevation-3)',
        modal: 'var(--elevation-4)',
        glow: 'var(--elevation-2)',
        '3xl': 'var(--elevation-4)',
        none: 'none',
      },
      transitionDuration: {
        // Tailwind's bare `transition*` utilities ship with 150ms, which is not
        // on the motion scale; DEFAULT is what those utilities read.
        DEFAULT: 'var(--motion-base)',
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
        page: 'var(--motion-page)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        enter: 'var(--ease-enter)',
        exit: 'var(--ease-exit)',
      },
      zIndex: {
        base: 'var(--z-base)',
        raised: 'var(--z-raised)',
        sticky: 'var(--z-sticky)',
        header: 'var(--z-header)',
        drawer: 'var(--z-drawer)',
        dropdown: 'var(--z-dropdown)',
        popover: 'var(--z-popover)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        tooltip: 'var(--z-tooltip)',
      },
      screens: {
        // Named breakpoints: mobile / tablet / desktop / wide
        xs: '480px',
      },
    },
  },
  plugins: [],
};
