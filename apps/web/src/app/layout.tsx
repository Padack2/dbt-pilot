import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { ChatDrawer } from "@/components/ChatDrawer";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className}>
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
