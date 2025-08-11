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
          hover: 'var(--primary-hover)'
        },
        success: 'var(--success)', warning: 'var(--warning)', 
        danger: 'var(--danger)', info: 'var(--info)',
        'nav-bg': 'var(--nav-bg)', 'nav-border': 'var(--nav-border)',
        'button-secondary': 'var(--button-secondary)',
        'button-secondary-hover': 'var(--button-secondary-hover)'
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
