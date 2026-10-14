import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep obsidian black for details, high-contrast text, sharp badges & buttons
        obsidian: {
          DEFAULT: "#0D0D12",
          50: "#2A2A38",
          100: "#22222D",
          200: "#1A1A23",
          800: "#14141B",
          900: "#0D0D12",
          950: "#060609",
        },
        // Cosmic Latte beige: celestial warm ivory-beige foundation
        cosmic: {
          50: "#FDFBF7",
          100: "#FAF7F2",
          200: "#F5EFEB",
          300: "#EFE8DE",
          400: "#E5DCCE",
          500: "#D3C6B2",
          600: "#B8A88E",
        },
        // Blush Lavender: delicate dusty rose-lavender
        blush: {
          50: "#FCF8FD",
          100: "#F7EEF8",
          200: "#F0E0F2",
          300: "#E5CCE7",
          400: "#D6B5D9",
          500: "#C49BC8",
          600: "#AA7FB2",
        },
        // Soft Lilac: ethereal futuristic glow and accent
        lilac: {
          50: "#FAF7FD",
          100: "#F3EDFC",
          200: "#E8DCF9",
          300: "#D8C5F4",
          400: "#C2A7EE",
          500: "#A985E5",
          600: "#8F65DC",
          700: "#7546D0",
        },
      },
      boxShadow: {
        futuristic: "0 4px 24px -2px rgba(203, 184, 242, 0.18), 0 2px 8px -1px rgba(13, 13, 18, 0.04)",
        "futuristic-hover": "0 8px 32px -4px rgba(203, 184, 242, 0.28), 0 4px 12px -2px rgba(13, 13, 18, 0.06)",
        obsidian: "0 4px 20px -2px rgba(13, 13, 18, 0.35)",
        glass: "0 8px 32px 0 rgba(142, 117, 196, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
