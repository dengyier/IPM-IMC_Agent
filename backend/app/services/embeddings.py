"""可插拔 Embedding 服务。

- provider=local：中文友好的字符 n-gram 哈希向量（确定性、离线、无依赖）。
- provider=openai：任意 OpenAI 兼容 embedding 端点（如 BGE-M3 部署）。

刻意不与 DeepSeek 强绑定——DeepSeek 主要用于文本生成/推理。
"""

from __future__ import annotations

import hashlib
import math
import re

from app.core.config import Settings


class EmbeddingProvider:
    def embed_text(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]

    def embed_texts(self, texts: list[str]) -> list[list[float]]:  # pragma: no cover
        raise NotImplementedError


class LocalHashingEmbedding(EmbeddingProvider):
    """字符 unigram + bigram 哈希到固定维度，L2 归一化。

    对中文有效（不依赖空格分词），适合离线开发与确定性测试。
    """

    def __init__(self, dimensions: int = 256):
        self.dimensions = dimensions

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        tokens = self._tokenize(text)
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        text = text.lower().strip()
        if not text:
            return ["__empty__"]
        # 中文按字 + 相邻二元组；英文/数字按词
        cn_chars = re.findall(r"[一-鿿]", text)
        bigrams = [cn_chars[i] + cn_chars[i + 1] for i in range(len(cn_chars) - 1)]
        words = re.findall(r"[a-z0-9][a-z0-9\-]+", text)
        tokens = cn_chars + bigrams + words
        return tokens or ["__empty__"]


class OpenAICompatibleEmbedding(EmbeddingProvider):
    def __init__(self, settings: Settings):
        from openai import OpenAI

        self.model = settings.embedding_model
        self.client = OpenAI(
            api_key=settings.embedding_api_key or "sk-noop",
            base_url=settings.embedding_base_url,
        )

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        resp = self.client.embeddings.create(model=self.model, input=texts)
        return [item.embedding for item in resp.data]


def build_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.embedding_provider == "openai" and settings.embedding_base_url:
        try:
            return OpenAICompatibleEmbedding(settings)
        except Exception:
            # 任意初始化失败都回退到本地，保证服务可启动
            return LocalHashingEmbedding(settings.embedding_dim)
    return LocalHashingEmbedding(settings.embedding_dim)
