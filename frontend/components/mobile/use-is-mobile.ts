"use client";

import { useEffect, useState } from "react";

// 移动端断点与 Tailwind 的 md(768px) 对齐：<768px 视为移动端。
// 返回 null 表示尚未挂载（SSR/首帧），调用方据此避免水合闪烁。
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}
