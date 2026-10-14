/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050816',
        nav: '#080D20',
        card: '#0B1228',
        card2: '#101831',
        line: '#202D50',
        roxo: { DEFAULT: '#7C3AED', vivo: '#8B5CF6', luz: '#A855F7' },
        verde: '#2DE2A6',
        ciano: '#27D9D0',
        rosa: '#F052A0',
        laranja: '#FF9F43',
        txt: '#F5F7FF',
        txt2: '#9AA8C7',
        txt3: '#697795',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '18px', '3xl': '24px' },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -18px rgba(0,0,0,0.9)',
        glow: '0 0 0 1px rgba(124,58,237,.35), 0 10px 30px -12px rgba(124,58,237,.65)',
        glowsm: '0 6px 18px -10px rgba(124,58,237,.9)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        pop: { '0%': { opacity: '0', transform: 'scale(.97)' }, '100%': { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(124,58,237,.45)' },
          '50%': { boxShadow: '0 0 0 10px rgba(124,58,237,0)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp .35s cubic-bezier(.22,1,.36,1) both',
        fadeIn: 'fadeIn .25s ease both',
        pop: 'pop .18s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        pulseGlow: 'pulseGlow 2.4s infinite',
      },
    },
  },
  plugins: [],
}
