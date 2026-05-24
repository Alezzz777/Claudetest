import "./globals.css";
import type { Metadata, Viewport } from "next";
import MobileNav from "@/components/MobileNav";

export const metadata: Metadata = {
  title: "Tie Catalog",
  description: "Домашняя картотека галстуков с AI-распознаванием",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen">
        <main className="mx-auto max-w-md pb-24">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
