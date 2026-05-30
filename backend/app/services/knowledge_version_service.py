"""KnowledgeVersionService —— 核心方法论节点版本演进（算法七）。

负责：把【已审核通过】的扩展知识单元吸收为节点的新版本。

铁律：
- 只吸收 review_status='approved' 的 ExpansionItem。
- 只叠加 supplementary_context，绝不覆盖核心字段
  （definition / core_principle / core_thinking / decision_logic）。
- 版本号在节点当前版本基础上自增 minor（v1.0 → v1.1 → v1.2 ...）。
"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.db.models import (
    ExpansionItem,
    KnowledgeNodeVersion,
    MethodologyNode,
)

_EXT_TYPE_LABEL = {
    "customer_context_extensions": "客户背景",
    "case_extensions": "案例",
    "scenario_extensions": "场景",
    "external_view_extensions": "外部观点",
    "different_views": "不同观点",
    "practice_feedback": "实践反馈",
}


class KnowledgeVersionService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def evolve_node(
        self, node_id: str, created_by: str | None = None
    ) -> tuple[KnowledgeNodeVersion | None, list[str]]:
        """汇总该节点下所有已审核扩展，生成新版本。返回 (version, trace)。"""
        trace: list[str] = []
        node = self.db.get(MethodologyNode, node_id)
        if not node:
            raise ValueError("节点不存在，无法演进。")

        approved = (
            self.db.query(ExpansionItem)
            .filter(
                ExpansionItem.aligned_node_id == node_id,
                ExpansionItem.review_status == "approved",
            )
            .order_by(ExpansionItem.created_at)
            .all()
        )
        if not approved:
            trace.append("无已审核扩展，跳过版本演进。")
            return None, trace

        # 已吸收的 item 不重复吸收
        incorporated_before: set[str] = set()
        for v in (
            self.db.query(KnowledgeNodeVersion)
            .filter(KnowledgeNodeVersion.node_id == node_id)
            .all()
        ):
            incorporated_before.update(v.incorporated_item_ids or [])

        new_items = [it for it in approved if it.id not in incorporated_before]
        if not new_items:
            trace.append("已审核扩展均已吸收，无新增。")
            return None, trace

        supplementary = self._build_supplementary(new_items)
        next_version = self._next_version(node_id, node.version)

        version = KnowledgeNodeVersion(
            node_id=node_id,
            version=next_version,
            change_type="expansion_absorption",
            change_summary=f"吸收 {len(new_items)} 条已审核扩展，叠加补充上下文（不改动核心字段）。",
            supplementary_context=supplementary,
            incorporated_item_ids=[it.id for it in new_items],
            status="active",
            created_by=created_by,
        )
        self.db.add(version)

        # 仅更新节点的版本号指针，核心字段保持不变
        node.version = next_version
        self.db.add(node)
        self.db.flush()

        trace.append(
            f"节点「{node.node_name}」演进到 {next_version}，吸收 {len(new_items)} 条扩展。"
        )
        return version, trace

    # ------------------------------------------------------------------ #
    # internal
    # ------------------------------------------------------------------ #

    def _build_supplementary(self, items: list[ExpansionItem]) -> str:
        lines: list[str] = []
        for it in items:
            label = _EXT_TYPE_LABEL.get(it.extension_type, "扩展")
            body = it.summary or it.content[:200]
            lines.append(f"【{label}】{it.title}：{body}")
        return "\n".join(lines)

    def _next_version(self, node_id: str, current: str) -> str:
        versions = [
            v.version
            for v in self.db.query(KnowledgeNodeVersion)
            .filter(KnowledgeNodeVersion.node_id == node_id)
            .all()
        ]
        versions.append(current or "v1.0")
        max_minor = 0
        major = 1
        for v in versions:
            m = re.match(r"v(\d+)\.(\d+)", v or "")
            if m:
                major = max(major, int(m.group(1)))
                if int(m.group(1)) == major:
                    max_minor = max(max_minor, int(m.group(2)))
        return f"v{major}.{max_minor + 1}"
