import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html','./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', fg: 'var(--fg)', muted: 'var(--muted)',
        border: 'var(--border)', surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)', 'surface-active': 'var(--surface-active)',
        primary: { 
          DEFAULT: 'var(--primary)', 
          600: 'var(--primary-600)', 
          100: 'var(--primary-100)',
          hover: 'var(--primary-hover)',
          foreground: 'var(--primary-foreground)'
        },
        success: { 
          DEFAULT: 'var(--success)', 
          hover: 'var(--success-hover)',
          bg: 'var(--success-bg)',
          border: 'var(--success-border)',
          text: 'var(--success-text)',
          foreground: 'var(--success-foreground)'
        },
        warning: { 
          DEFAULT: 'var(--warning)', 
          hover: 'var(--warning-hover)',
          bg: 'var(--warning-bg)',
          border: 'var(--warning-border)',
          text: 'var(--warning-text)',
          foreground: 'var(--warning-foreground)'
        },
        danger: { 
          DEFAULT: 'var(--danger)', 
          hover: 'var(--danger-hover)',
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
          text: 'var(--danger-text)',
          foreground: 'var(--danger-foreground)'
        },
        destructive: { 
          DEFAULT: 'var(--danger)', 
          hover: 'var(--danger-hover)',
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
          text: 'var(--danger-text)',
          foreground: 'var(--danger-foreground)'
        },
        info: { 
          DEFAULT: 'var(--info)', 
          hover: 'var(--info-hover)',
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
          text: 'var(--info-text)'
        },
        'nav-bg': 'var(--nav-bg)', 'nav-border': 'var(--nav-border)',
        'button-secondary': 'var(--button-secondary)',
        'button-secondary-hover': 'var(--button-secondary-hover)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)'
      },
      boxShadow: {
        'soft': 'var(--shadow-soft)',
        'medium': 'var(--shadow-medium)'
      },
      fontFamily: {
        cjk: ['var(--font-cjk)'],
        decor: ['var(--font-latin-decor)'],
        mono: ['var(--font-mono)'],
      },
      animation: {
        'theme-transition': 'theme-change 0.3s ease-in-out'
      }
    }
  },
  plugins: [],
} satisfies Config
