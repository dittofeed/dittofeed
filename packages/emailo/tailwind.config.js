const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  important: ".emailo",
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  safelist: ["ProseMirror"],
  plugins: [require("tailwindcss-animate")],
  theme: {
    extend: {
      colors: {
        solarized: {
          // Base Colors
          base03: "#002b36",
          base02: "#073642",
          base01: "#586e75",
          base00: "#657b83",
          base0: "#839496",
          base1: "#93a1a1",
          base2: "#eee8d5",
          base3: "#fdf6e3",
          // Accent Colors
          yellow: "#b58900",
          orange: "#cb4b16",
          red: "#dc322f",
          magenta: "#d33682",
          violet: "#6c71c4",
          blue: "#268bd2",
          cyan: "#2aa198",
          green: "#859900",
        },
      },
    },
  },
};
