/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        negro: '#1A1A17',
        hueso: '#FAF8F1',
        arena: '#D4D1CB',
        'blanco-gris': '#F0EEF0',
        'gris-claro': '#C5C2C0',
        'gris-medio': '#A4A4A6',
        'azul-acero': '#4E769B',
        terracota: '#B34E35',
        dorado: '#FDDA78',
        turquesa: '#38B1B1',
      },
      fontFamily: {
        sans: ['Work Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
