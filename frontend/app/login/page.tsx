"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-context";
import { Icon } from "@/components/icon";
import { ApiError, authApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [redirectTo, setRedirectTo] = useState("/");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const normalizedPhone = useMemo(() => phone.replace(/\D/g, ""), [phone]);
  const canSendCode = normalizedPhone.length === 11 && countdown === 0 && !sending;
  const canLogin = normalizedPhone.length === 11 && code.trim().length >= 4 && !submitting;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectTo(params.get("redirect") || "/");
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function handleSendCode() {
    if (!canSendCode) return;
    setSending(true);
    setMessage("");
    try {
      const result = await authApi.sendSmsCode(normalizedPhone);
      setCountdown(result.resend_after_seconds);
      setMessage("验证码已发送，请查看手机短信");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "验证码发送失败");
    } finally {
      setSending(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canLogin) return;
    setSubmitting(true);
    setMessage("");
    try {
      await login(normalizedPhone, code);
      router.replace(redirectTo);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <section className="grid w-full max-w-[1040px] grid-cols-[1.05fr_0.95fr] overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_28px_90px_rgba(30,58,138,0.12)]">
        <div className="relative min-h-[620px] overflow-hidden bg-[#f5f7ff] px-12 py-11">
          <div className="absolute inset-x-0 bottom-0 h-72 bg-[radial-gradient(circle_at_45%_70%,rgba(91,75,255,0.24),transparent_46%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-2xl shadow-soft">
                <Icon name="boxes" className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-[20px] font-black text-ink">IMC&IPM</div>
                <div className="text-[13px] font-semibold text-slate-500">商业决策智能体</div>
              </div>
            </div>

            <div className="mt-24 max-w-[420px]">
              <h1 className="text-[34px] font-black leading-tight text-ink">
                用港大 IMC&IPM 方法论，连接知识资产与企业决策
              </h1>
              <p className="mt-5 text-[15px] leading-8 text-slate-500">
                登录后可进入工作台，进行知识检索、商业画布诊断、同学笔记进化和诊断报告管理。
              </p>
            </div>

            <div className="mt-16 grid max-w-[430px] grid-cols-2 gap-3">
              {["核心知识节点", "DeepSeek 推理", "商业画布诊断", "报告沉淀复用"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/80 bg-white/76 px-4 py-3 text-[13px] font-bold text-[#26345f] shadow-[0_12px_28px_rgba(30,58,138,0.06)]">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-[620px] flex-col justify-center px-12 py-11">
          <div>
            <div className="text-[28px] font-black text-ink">手机号验证码登录</div>
            <p className="mt-3 text-[14px] leading-7 text-slate-500">
              请输入管理员手机号，系统会发送一次性验证码用于登录。
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-9 space-y-5">
            <label className="block">
              <span className="text-[13px] font-bold text-[#172452]">手机号</span>
              <div className="mt-2 flex h-[52px] items-center rounded-2xl border border-line bg-white px-4 focus-within:border-brand/60">
                <span className="mr-3 text-[14px] font-bold text-slate-400">+86</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="请输入 11 位手机号"
                  inputMode="tel"
                  className="h-12 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:text-slate-400"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[13px] font-bold text-[#172452]">短信验证码</span>
              <div className="mt-2 flex h-[52px] items-center gap-3">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="请输入验证码"
                  inputMode="numeric"
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-[15px] font-semibold text-ink outline-none placeholder:text-slate-400 focus:border-brand/60"
                />
                <button
                  type="button"
                  disabled={!canSendCode}
                  onClick={handleSendCode}
                  className="h-12 min-w-[128px] rounded-2xl border border-indigo-100 bg-[#f4f2ff] px-4 text-[13px] font-black text-brand transition-colors hover:bg-[#ece8ff] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {sending ? "发送中" : countdown > 0 ? `${countdown}s` : "获取验证码"}
                </button>
              </div>
            </label>

            {message && (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-[13px] font-semibold text-slate-600">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={!canLogin}
              className="brand-gradient flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-black text-white shadow-soft transition disabled:cursor-not-allowed disabled:opacity-55"
            >
              {submitting ? <Icon name="refresh" className="h-4 w-4 animate-spin" /> : null}
              登录工作台
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
