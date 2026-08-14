import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const imageUrl = `${origin}/og.png`;

  return {
    title: "修炼档案",
    description: "用修仙境界、十层进阶和任务计数管理长期道途修行。",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "修炼档案",
      description: "把道途修行拆成境界、层数和可推进的任务。",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "修炼档案" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "修炼档案",
      description: "把道途修行拆成境界、层数和可推进的任务。",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
