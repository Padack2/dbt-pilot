import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { ChatDrawer } from "@/components/ChatDrawer";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata: Metadata = {
  title: "dbt Pilot",
  description: "dbt 관리 대시보드 + LLM 챗봇",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${inter.className}`}>
        <div className="app-shell">
          <div className="app-main">
            <NavBar />
            {children}
          </div>
          <ChatDrawer />
        </div>
      </body>
    </html>
  );
}
