/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nat: '#ec4899',
        ang: '#06b6d4',
        buffet: '#f59e0b'
      }
    }
  },
  plugins: []
}
