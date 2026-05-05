import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0a0a0b", 900: "#1a1a1d", 800: "#2a2a2f", 700: "#3a3a42" },
        accent: { 500: "#6366f1", 600: "#4f46e5" },
      },
    },
  },
  plugins: [],
};
export default config;
