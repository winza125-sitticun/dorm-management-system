/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF8F3",
        paperDeep: "#F1ECE0",
        ink: "#1E2A38",
        inkSoft: "#5B6B7C",
        inkFaint: "#8B98A6",
        brass: "#A9814A",
        brassDeep: "#7C5E36",
        brassPale: "#EFE3CB",
        teal: "#3E6E64",
        tealPale: "#E1EDE9",
        rust: "#B5502F",
        rustPale: "#F5E3DB",
        line: "#E1DACB",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
