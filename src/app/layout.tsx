import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import RegisterServiceWorker from "@/components/pwa/register-service-worker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FirmTrack — Track Performance, Grow Your Firm",
  description:
    "Practice management for legal firms: time and billing, accounting, HR, and calendaring in one place.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FirmTrack",
  },
};

export const viewport: Viewport = {
  themeColor: "#0855fd",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
