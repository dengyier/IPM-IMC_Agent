"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./icon";
import { ApiError, type FeedbackCategory, feedbackApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const CATEGORIES: { key: FeedbackCategory; label: string }[] = [
  { key: "suggestion", label: "功能建议" },
  { key: "problem", label: "问题反馈" },
  { key: "other", label: "其它" },
];

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>("suggestion");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  function reset() {
    setCategory("suggestion");
    setContent("");
    setContact("");
    setDone(false);
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function submit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await feedbackApi.create({
        category,
        content: content.trim(),
        contact: contact.trim() || undefined,
        page_url: window.location.href,
        user_agent: window.navigator.userAgent,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "提交失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4 py-6" onClick={handleClose}>
      <div
        className="max-h-[calc(100vh-48px)] w-[min(92vw,480px)] min-w-[320px] overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-black text-ink">意见反馈</h2>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-brand"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon name="check-circle" className="h-6 w-6" />
            </span>
            <p className="text-[14px] font-bold text-ink">感谢你的反馈！</p>
            <p className="text-[12.5px] text-slate-500">我们会认真查看每一条建议。</p>
            <button
              onClick={handleClose}
              className="brand-gradient mt-2 h-10 rounded-xl px-6 text-[13px] font-bold text-white shadow-soft"
            >
              完成
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-[12.5px] text-slate-500">使用中遇到问题或有建议？告诉我们。</p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    "h-9 rounded-lg border text-[13px] font-bold transition-colors",
                    category === c.key
                      ? "border-brand bg-[#f0edff] text-brand"
                      : "border-line bg-white text-slate-500 hover:text-brand"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              maxLength={2000}
              autoFocus
              className="mt-3 w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-[13px] leading-6 text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-brand/50"
              placeholder="请描述你的建议或遇到的问题…"
            />

            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={120}
              className="mt-3 h-10 w-full rounded-xl border border-line bg-white px-4 text-[13px] text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-brand/50"
              placeholder="联系方式（选填，便于我们回复）"
            />

            {error && <p className="mt-3 text-[12.5px] font-semibold text-rose-500">{error}</p>}

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={handleClose}
                disabled={submitting}
                className="h-10 rounded-xl border border-line bg-white px-5 text-[13px] font-bold text-slate-500 hover:text-brand disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={!content.trim() || submitting}
                className="brand-gradient flex h-10 items-center gap-2 rounded-xl px-6 text-[13px] font-bold text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Icon name="refresh" className="h-4 w-4 animate-spin" />}
                {submitting ? "提交中…" : "提交反馈"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
