import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#1E3A8A",
        brand: "#5B4BFF",
        violet: "#7C5CFF",
        canvas: "#F5F7FC",
        ink: "#111827",
        line: "#E4EAF4",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 16px 38px rgba(30,58,138,0.055), 0 1px 4px rgba(16,24,40,0.04)",
        soft: "0 8px 22px rgba(91,75,255,0.16)",
        float: "0 18px 52px rgba(30,58,138,0.12)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
    },
  },
  plugins: [],
};

export default config;
