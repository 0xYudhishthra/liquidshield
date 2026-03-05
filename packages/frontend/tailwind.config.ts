import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        shield: {
          primary: "#8b5cf6",
          secondary: "#6366f1",
          accent: "#10b981",
          danger: "#ef4444",
          warning: "#f59e0b",
          bg: "#0f0f1a",
          surface: "#1a1a2e",
          border: "#2a2a4a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
