/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        "bg-3": "var(--bg-3)",
        blue: "rgb(var(--blue-rgb) / <alpha-value>)",
        cyan: "rgb(var(--cyan-rgb) / <alpha-value>)",
        purple: "rgb(var(--purple-rgb) / <alpha-value>)",
        pink: "rgb(var(--pink-rgb) / <alpha-value>)",
        orange: "rgb(var(--orange-rgb) / <alpha-value>)",
        cream: "rgb(var(--cream-rgb) / <alpha-value>)",
        "cream-2": "var(--cream-2)",
        "cream-3": "var(--cream-3)",
      },
      fontFamily: {
        display: ['"Anton"', "Inter", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        accent: ['"Caveat"', "cursive"],
      },
      letterSpacing: {
        display: "-0.035em",
      },
      maxWidth: {
        content: "1180px",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "blob-drift": {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(4%, -3%) scale(1.06)" },
        },
        "pulse-glow": {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "0.85" },
        },
        "float-y": {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "blob-drift": "blob-drift 18s ease-in-out infinite",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
        "float-y": "float-y 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
