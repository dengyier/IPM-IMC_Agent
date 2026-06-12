"use client";

import { MobileHome } from "@/components/mobile/home";
import { useIsMobile } from "@/components/mobile/use-is-mobile";
import { ValidationWorkbenchPage } from "@/components/validation-workbench/page";

// 经营工作台首页只承载全局概览；AI 经营访谈统一从 /chat 进入。
export function HomeRouter() {
  const isMobile = useIsMobile();
  if (isMobile === null) return null;
  if (isMobile) return <MobileHome />;
  return <ValidationWorkbenchPage />;
}
