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
  title: "FirmTrack — Legal Practice Management Software for Law Firms",
  description:
    "FirmTrack is legal practice management software for law firms in Nigeria and beyond — time and billing, trust accounting, HR, payroll, documents, and calendaring in one secure platform.",
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
