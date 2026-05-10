import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthSessionProvider } from "@/components/auth/SessionProvider";
import { StreamCoreI18nProvider } from "@/components/i18n/I18nProvider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "StreamCore",
    template: "%s | StreamCore"
  },
  applicationName: "StreamCore",
  description:
    "One tab. One core. Total command. Centralize your bots, overlays, and Spotify controls into one high-performance command center.",
  openGraph: {
    title: "StreamCore",
    description:
      "One tab. One core. Total command. Centralize your bots, overlays, and Spotify controls into one high-performance command center.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "StreamCore",
    description:
      "One tab. One core. Total command. Centralize your bots, overlays, and Spotify controls into one high-performance command center."
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <AuthSessionProvider>
          <StreamCoreI18nProvider>{children}</StreamCoreI18nProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}

