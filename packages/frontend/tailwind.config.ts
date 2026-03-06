import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Surface System ──────────────────────────────────
        bg: {
          DEFAULT: 'hsl(220, 20%, 7%)',     // near-black, blue undertone
          deep:    'hsl(220, 22%, 5%)',      // deepest — page bg
        },
        surface: {
          DEFAULT:  'hsl(220, 18%, 11%)',    // card bg
          elevated: 'hsl(220, 16%, 14%)',    // raised elements
          hover:    'hsl(220, 14%, 17%)',    // interactive hover
        },

        // ── Accent ──────────────────────────────────────────
        accent: {
          DEFAULT: 'hsl(160, 84%, 50%)',     // electric mint — "money green"
          muted:   'hsl(160, 60%, 35%)',     // subdued accent
          dim:     'hsl(160, 84%, 50%, 0.06)', // surface tint
          glow:    'hsl(160, 84%, 50%, 0.15)', // glow / ring
        },

        // ── Text ────────────────────────────────────────────
        text: {
          DEFAULT: 'hsl(0, 0%, 93%)',        // primary — warm off-white
          muted:   'hsl(220, 10%, 45%)',     // secondary
          dim:     'hsl(220, 10%, 30%)',     // tertiary / disabled
        },

        // ── Status ──────────────────────────────────────────
        status: {
          success: 'hsl(160, 72%, 42%)',
          warning: 'hsl(40, 96%, 56%)',
          danger:  'hsl(0, 72%, 56%)',
          info:    'hsl(210, 72%, 56%)',
        },

        // ── Score Tiers ─────────────────────────────────────
        score: {
          poor:      'hsl(0, 72%, 56%)',
          fair:      'hsl(40, 96%, 56%)',
          good:      'hsl(50, 92%, 54%)',
          'very-good': 'hsl(140, 60%, 70%)',
          excellent: 'hsl(160, 72%, 42%)',
        },

        // ── Brand ───────────────────────────────────────────
        avax: '#E84142',
        border: {
          DEFAULT: 'hsl(220, 14%, 16%)',     // subtle dividers
          bright:  'hsl(220, 14%, 22%)',     // stronger separation
        },
      },

      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', '"JetBrains Mono"', 'monospace'],
        sans:    ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },

      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
        'dot-grid': 'radial-gradient(circle, hsl(220, 14%, 18%) 1px, transparent 1px)',
      },

      backgroundSize: {
        'dot-sm': '24px 24px',
      },

      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },

      boxShadow: {
        'glow-accent': '0 0 24px hsl(160, 84%, 50%, 0.2)',
        'glow-danger': '0 0 24px hsl(0, 72%, 56%, 0.2)',
        card:          '0 1px 2px hsl(0, 0%, 0%, 0.5), 0 0 0 1px hsl(220, 14%, 14%)',
        'card-hover':  '0 8px 32px hsl(0, 0%, 0%, 0.6), 0 0 0 1px hsl(220, 14%, 18%)',
        'inset-t':     'inset 0 1px 0 hsl(220, 14%, 18%)',
      },

      animation: {
        'fade-in':       'fadeIn 0.4s ease-out both',
        'slide-up':      'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up-1':    'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both',
        'slide-up-2':    'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
        'slide-up-3':    'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both',
        'slide-up-4':    'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
        'slide-up-5':    'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both',
        'pulse-glow':    'pulseGlow 3s ease-in-out infinite',
        'spin-slow':     'spin 3s linear infinite',
        'counter':       'counterSpin 0.5s ease-out',
      },

      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px hsl(160, 84%, 50%, 0.1)' },
          '50%':      { boxShadow: '0 0 28px hsl(160, 84%, 50%, 0.25)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
