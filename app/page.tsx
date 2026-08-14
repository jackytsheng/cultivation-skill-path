import type { Metadata } from "next";
import { CultivationApp } from "./CultivationApp";

export const metadata: Metadata = {
  title: "修炼档案",
  description: "一个用境界、层数和任务进度管理长期道途修行的本地应用。",
};

export default function Home() {
  return <CultivationApp />;
}
