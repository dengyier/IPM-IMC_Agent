"""DeepSeek LLM 服务（OpenAI 兼容客户端）。

无 API key 时 chat_json/chat_text 返回 None，调用方应走本地确定性回退。
"""

from __future__ import annotations

import json

from app.core.config import Settings


class LLMService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.model = settings.deepseek_model
        self._client = None
        if settings.deepseek_api_key:
            try:
                from openai import OpenAI

                self._client = OpenAI(
                    api_key=settings.deepseek_api_key,
                    base_url=settings.deepseek_base_url,
                )
            except Exception:
                self._client = None

    @property
    def available(self) -> bool:
        return self._client is not None

    def ping(self) -> dict:
        """实时探测 LLM 连通性（真实往返一次最小请求）。

        与 chat_* 不同：这里**不吞异常**，把错误明细返回给调用方用于「测试连接」。
        """
        import time

        if not self.settings.deepseek_api_key:
            return {"ok": False, "model": self.model, "latency_ms": None,
                    "detail": "未配置 DEEPSEEK_API_KEY"}
        if not self._client:
            return {"ok": False, "model": self.model, "latency_ms": None,
                    "detail": "LLM 客户端初始化失败（openai 依赖或 base_url 异常）"}
        started = time.perf_counter()
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
                temperature=0,
            )
            latency = int((time.perf_counter() - started) * 1000)
            ok = bool(resp.choices)
            return {"ok": ok, "model": self.model, "latency_ms": latency,
                    "detail": "连接正常" if ok else "无返回内容"}
        except Exception as exc:  # noqa: BLE001 故意上抛明细给前端
            latency = int((time.perf_counter() - started) * 1000)
            return {"ok": False, "model": self.model, "latency_ms": latency,
                    "detail": f"{type(exc).__name__}: {exc}"}

    def chat_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        max_tokens: int | None = None,
    ) -> dict | None:
        """返回解析后的 JSON 对象；不可用或解析失败时返回 None。

        max_tokens：详尽报告等场景可显式放大输出上限（DeepSeek 单次最高 8192）。
        """
        if not self._client:
            return None
        try:
            kwargs: dict = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": temperature,
            }
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            resp = self._client.chat.completions.create(**kwargs)
            content = resp.choices[0].message.content or "{}"
            return json.loads(content)
        except Exception:
            return None

    def chat_text(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.3
    ) -> str | None:
        if not self._client:
            return None
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
            )
            return resp.choices[0].message.content
        except Exception:
            return None
