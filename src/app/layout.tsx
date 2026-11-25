import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Inter, Oswald } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const shoulders = Big_Shoulders({ variable: "--font-shoulders", subsets: ["latin"], weight: ["600", "700", "800", "900"], adjustFontFallback: false });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "RepWon Install", template: "%s · RepWon Install" },
  description: "Turn your playbook into study and quizzes for your players.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${shoulders.variable} ${oswald.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
