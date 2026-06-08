import { MobileProfile } from "@/components/mobile/profile";

// 移动端「我的」个人中心（仅移动端 Tab 入口；自带底部 Tab 栏）。
export default function Page() {
  return (
    <div className="flex min-h-dvh overflow-hidden bg-transparent md:min-h-screen">
      <MobileProfile />
    </div>
  );
}
