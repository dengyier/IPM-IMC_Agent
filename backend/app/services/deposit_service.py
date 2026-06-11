"""通用文本沉淀服务：文本 → 存档文件 → ExpansionSource → （可选）吸收进入审核链路。

供「助手消息沉淀」「天机推演资产沉淀」等入口复用。
候选内容一律落扩展层（source_layer="expansion"）并走人工审核，不直接进入核心知识库。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import ExpansionSource
from app.graphs.external_info_evolution_graph import ExternalInfoEvolutionGraph
from app.services.embeddings import EmbeddingProvider
from app.services.llm import LLMService
from app.services.vector_store import VectorStore


@dataclass
class TextDepositResult:
    source: ExpansionSource
    status: str
    chunk_count: int = 0
    embedded_count: int = 0
    item_count: int = 0
    review_task_count: int = 0
    vector_backend: str | None = None


def safe_filename(title: str, fallback: str = "deposit") -> str:
    safe = re.sub(r"[^0-9A-Za-z._\-\u4e00-\u9fff]+", "_", title).strip("_")[:80]
    return safe or fallback


def deposit_text_source(
    db: Session,
    settings: Settings,
    embeddings: EmbeddingProvider,
    expansion_store: VectorStore,
    llm: LLMService | None,
    *,
    title: str,
    text: str,
    source_type: str,
    submitted_by: str,
    tenant_id: str | None,
    file_stub: str,
    subdir: str = "text-deposits",
    visibility: str = "team",
    meta: dict | None = None,
    auto_absorb: bool = True,
) -> TextDepositResult:
    """落档并创建 ExpansionSource；auto_absorb 时同步走吸收图生成审核任务。

    run_absorb 解析失败抛 ValueError，由调用方转为 HTTP 400。
    """
    deposit_dir = Path(settings.storage_dir) / subdir
    deposit_dir.mkdir(parents=True, exist_ok=True)
    deposit_path = deposit_dir / f"{file_stub}_{safe_filename(title)}.md"
    deposit_path.write_text(text, encoding="utf-8")

    source = ExpansionSource(
        tenant_id=tenant_id,
        title=title,
        source_type=source_type,
        file_path=str(deposit_path),
        submitted_by=submitted_by,
        source_layer="expansion",
        visibility=visibility,
        status="uploaded",
        meta=meta or {},
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    result = TextDepositResult(
        source=source, status=source.status, vector_backend=expansion_store.backend
    )
    if auto_absorb:
        absorb = ExternalInfoEvolutionGraph(
            db=db,
            settings=settings,
            embeddings=embeddings,
            expansion_store=expansion_store,
            llm=llm,
        ).run_absorb(source)
        result.chunk_count = absorb.chunk_count
        result.embedded_count = absorb.embedded_count
        result.item_count = absorb.item_count
        result.review_task_count = absorb.review_task_count
        result.vector_backend = absorb.vector_backend
        result.status = absorb.status
    return result
