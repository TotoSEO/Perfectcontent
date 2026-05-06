import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090b",
          900: "#0c0d10",
          850: "#101115",
          800: "#16171c",
          750: "#1c1d23",
          700: "#262830",
          600: "#33353f",
          500: "#43454f",
        },
        accent: {
          50: "#eef0ff",
          100: "#dde1ff",
          200: "#bcc3ff",
          300: "#959fff",
          400: "#7c84ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#1e1b4b",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(99,102,241,0.35), 0 8px 32px -12px rgba(99,102,241,0.45)",
        card: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 24px 48px -24px rgba(0,0,0,0.6)",
        cta: "0 6px 20px -6px rgba(99,102,241,0.55), 0 2px 6px -2px rgba(99,102,241,0.35)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        fadein: "fadeIn 0.22s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-soft": "pulseSoft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
