/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        negro: '#1A1A17',
        grafito: '#3C3939',
        'gris-medio': '#A4A4A6',
        'gris-claro': '#C5C2C0',
        'blanco-gris': '#F0EEF0',
        hueso: '#FAF8F1',
        arena: '#D4D1CB',
        platino: '#E6E6E6',
        'azul-acero': '#4E769B',
        terracota: '#B34E35',
        dorado: '#FDDA78',
        crema: '#FDF0AD',
        turquesa: '#38B1B1',
        petroleo: '#085C6D',
        'cian-light': '#CFE8E9',
      },
      fontFamily: {
        sans: ['Work Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
