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

    def chat_json(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.2
    ) -> dict | None:
        """返回解析后的 JSON 对象；不可用或解析失败时返回 None。"""
        if not self._client:
            return None
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=temperature,
            )
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
