import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/layout/AuthProvider";
import { ToastContainer } from "@/components/ui/Toast";
import CookieBanner from "@/components/cookie/CookieBanner";

export const metadata: Metadata = {
  title: "PriceIQ - Government Pricing Intelligence",
  description: "AI-native pricing & proposal workspace for federal contractors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          {children}
          <ToastContainer />
          <CookieBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
