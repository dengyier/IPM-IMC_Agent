"""DeepSeek LLM 服务（OpenAI 兼容客户端）。

无 API key 时 chat_json/chat_text 返回 None，调用方应走本地确定性回退。
"""

from __future__ import annotations

import json
from collections.abc import Iterator

from app.core.config import Settings


class LLMService:
    def __init__(
        self,
        settings: Settings,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ):
        """默认用 DeepSeek 主模型；传入凭证覆盖即可指向任意 OpenAI 兼容服务（评审模型池用）。"""
        self.settings = settings
        self.model = model or settings.deepseek_model
        self._api_key = api_key if api_key is not None else settings.deepseek_api_key
        self._base_url = base_url or settings.deepseek_base_url
        self._client = None
        if self._api_key:
            try:
                from openai import OpenAI

                self._client = OpenAI(
                    api_key=self._api_key,
                    base_url=self._base_url,
                    timeout=90,
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

        if not self._api_key:
            return {"ok": False, "model": self.model, "latency_ms": None,
                    "detail": "未配置 API key"}
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

    def chat_text_stream(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.3
    ) -> Iterator[str]:
        """逐段返回文本 token；不可用或异常时产出空流。"""
        if not self._client:
            return
        try:
            stream = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield delta
        except Exception:
            return


def build_reviewer_pool(settings: Settings) -> list["LLMService"]:
    """BACH 异构评审模型池：只返回配置了 key 且初始化成功的评审实例。

    独立性来自模型家族异构（v2 算法 §7），同模型多角色不计入评审。
    """
    pool: list[LLMService] = []
    for api_key, base_url, model in (
        (settings.reviewer_a_api_key, settings.reviewer_a_base_url, settings.reviewer_a_model),
        (settings.reviewer_b_api_key, settings.reviewer_b_base_url, settings.reviewer_b_model),
    ):
        if not api_key:
            continue
        service = LLMService(settings, api_key=api_key, base_url=base_url, model=model)
        if service.available:
            pool.append(service)
    return pool
