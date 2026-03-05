/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Theme colors via CSS variables (defined in index.css)
        // Uses rgb() with <alpha-value> to support Tailwind opacity modifiers (e.g. bg-claude-surface/50)
        claude: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-surface) / <alpha-value>)',
          surfaceHover: 'rgb(var(--color-surface-hover) / <alpha-value>)',
          surfaceMuted: 'rgb(var(--color-surface-muted) / <alpha-value>)',
          surfaceInset: 'rgb(var(--color-surface-inset) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          borderLight: 'rgb(var(--color-border-light) / <alpha-value>)',
          text: 'rgb(var(--color-text) / <alpha-value>)',
          textSecondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          accent: 'rgb(var(--color-accent) / <alpha-value>)',
          accentHover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          accentLight: 'rgb(var(--color-accent-light) / <alpha-value>)',
          accentMuted: 'rgb(var(--color-accent-muted) / 0.10)',
        },
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
        }
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(0,0,0,0.05)',
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        elevated: '0 4px 12px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.04)',
        modal: '0 8px 30px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
        popover: '0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.05)',
        'glow-accent': '0 0 20px rgba(59,130,246,0.15)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.25s ease-out',
        'fade-in-down': 'fade-in-down 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        shimmer: 'shimmer 1.5s infinite',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      typography: {
        DEFAULT: {
          css: {
            color: 'rgb(var(--color-text))',
            a: {
              color: 'rgb(var(--color-accent))',
              '&:hover': {
                color: 'rgb(var(--color-accent-hover))',
              },
            },
            code: {
              color: 'rgb(var(--color-text))',
              backgroundColor: 'rgb(var(--color-surface-hover))',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '400',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
            pre: {
              backgroundColor: 'rgb(var(--color-surface-hover))',
              color: 'rgb(var(--color-text))',
              padding: '1em',
              borderRadius: '0.75rem',
              overflowX: 'auto',
            },
            blockquote: {
              borderLeftColor: 'rgb(var(--color-accent))',
              color: 'rgb(var(--color-text-secondary))',
            },
            h1: {
              color: 'rgb(var(--color-text))',
            },
            h2: {
              color: 'rgb(var(--color-text))',
            },
            h3: {
              color: 'rgb(var(--color-text))',
            },
            h4: {
              color: 'rgb(var(--color-text))',
            },
            strong: {
              color: 'rgb(var(--color-text))',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
