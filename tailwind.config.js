import typography from '@tailwindcss/typography';
import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './constants.ts',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Sidonie palette: warm stone neutrals replace Tailwind's default gray
        gray: {
          50: '#FFFCF9',
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716C',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
          950: '#0C0A09',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.gray.800'),
            maxWidth: 'none',
            lineHeight: '1.75',
            letterSpacing: '-0.01em',
            p: { marginTop: '1em', marginBottom: '1em' },
            'ul > li': { paddingLeft: '0.375em' },
            a: {
              color: theme('colors.gray.900'),
              textDecoration: 'underline',
              textDecorationColor: theme('colors.gray.300'),
              textUnderlineOffset: '4px',
              fontWeight: '500',
              '&:hover': { textDecorationColor: theme('colors.gray.900') },
            },
            code: {
              color: theme('colors.gray.900'),
              backgroundColor: theme('colors.gray.100'),
              padding: '2px 4px',
              borderRadius: '4px',
              fontWeight: '500',
              border: '1px solid ' + theme('colors.gray.200'),
              fontSize: '0.875em',
            },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            pre: {
              backgroundColor: '#1C1917',
              color: theme('colors.gray.50'),
              borderRadius: '0.5rem',
              padding: '1rem',
              lineHeight: '1.6',
              border: '1px solid ' + theme('colors.gray.200'),
            },
            'h1, h2, h3, h4': {
              color: theme('colors.gray.900'),
              fontWeight: '600',
              letterSpacing: '-0.02em',
            },
            blockquote: {
              borderLeftColor: theme('colors.gray.300'),
              fontStyle: 'normal',
              color: theme('colors.gray.600'),
            },
          },
        },
      }),
    },
  },
  plugins: [
    typography,
    plugin(({ addUtilities }) => {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
      });
    }),
  ],
};
