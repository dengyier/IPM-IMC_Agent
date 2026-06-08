"use client";

import { AssistantProvider } from "@/components/assistant-context";
import { HomeWorkspace } from "@/components/right-panel";
import { MobileHome } from "@/components/mobile/home";
import { useIsMobile } from "@/components/mobile/use-is-mobile";

// 工作台首页按视口分流：移动端 = 仪表盘；桌面端 = 对话工作台。
export function HomeRouter() {
  const isMobile = useIsMobile();
  if (isMobile === null) return null; // 挂载前不渲染，避免水合不匹配
  if (isMobile) return <MobileHome />;
  return (
    <AssistantProvider>
      <HomeWorkspace />
    </AssistantProvider>
  );
}
