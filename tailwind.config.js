module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wt: {
          accent: "var(--wt-accent)",
          "accent-muted": "var(--wt-accent-muted)",
          "accent-soft": "var(--wt-accent-soft)",
          "accent-strong": "var(--wt-accent-strong)",
          border: "var(--wt-border)",
          ink: "var(--wt-ink)",
          muted: "var(--wt-muted)",
          primary: "var(--wt-primary)",
          "primary-muted": "var(--wt-primary-muted)",
          "primary-soft": "var(--wt-primary-soft)",
          "primary-strong": "var(--wt-primary-strong)",
          surface: "var(--wt-surface)",
          "surface-muted": "var(--wt-surface-muted)",
        },
      },
    },
  },
  plugins: [],
};
