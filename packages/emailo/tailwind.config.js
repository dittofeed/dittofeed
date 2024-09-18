const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  safelist: ["ProseMirror"],
  plugins: [require("tailwindcss-animate")],
};
