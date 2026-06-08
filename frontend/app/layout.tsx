import type { Metadata } from "next";
import { AuthGate, AuthProvider } from "@/components/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "天机AI商业决策智能体",
  description: "基于港大 IMC&IPM 方法论的商业决策智能体工作台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
