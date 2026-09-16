import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
