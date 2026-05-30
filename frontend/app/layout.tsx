import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMC&IPM 商业决策智能体",
  description: "面向 IMC&IPM 课程知识资产的商业决策智能体工作台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
