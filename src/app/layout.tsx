import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "To'lovlar monitoringi",
  description: "Ijara to'lovlari taqsimoti va o'tkazilishi monitoringi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
