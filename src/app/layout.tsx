import type { Metadata, Viewport } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";
import { PWARegister } from "@/components/PWARegister";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PkPos - ระบบขายหน้าร้านสำหรับร้านอาหาร",
  description: "Production-ready PkPos: Dine-in / Takeaway / Delivery",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PkPos", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#059669",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body className="font-sans">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
