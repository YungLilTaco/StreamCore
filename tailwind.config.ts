import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 0%)",
        foreground: "hsl(0 0% 98%)",
        muted: "hsl(240 5% 15%)",
        "muted-foreground": "hsl(240 5% 65%)",
        card: "hsl(240 6% 10%)",
        "card-foreground": "hsl(0 0% 98%)",
        border: "hsl(240 6% 18%)",
        primary: "#A855F7"
      },
      boxShadow: {
        "glow-purple": "0 0 0 1px rgba(168,85,247,.22), 0 16px 60px rgba(168,85,247,.18)"
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(1200px circle at 25% -10%, rgba(168,85,247,0.20), transparent 55%), radial-gradient(900px circle at 80% 10%, rgba(56,189,248,0.10), transparent 55%), radial-gradient(900px circle at 50% 120%, rgba(168,85,247,0.08), transparent 55%)"
      }
    }
  },
  plugins: []
} satisfies Config;

