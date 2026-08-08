import type { Metadata } from "next";
import { Press_Start_2P, Inter } from "next/font/google";
import "./globals.css";

const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zombie Adventure Survival Game",
  description:
    "Un juego de aventura conversacional de supervivencia zombie en pixel art, narrado por IA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${pixelFont.variable} ${bodyFont.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-[#0b0f19] text-slate-200 font-sans">
        <div className="grain-overlay" aria-hidden />
        <div className="vignette-overlay" aria-hidden />
        {children}
      </body>
    </html>
  );
}
