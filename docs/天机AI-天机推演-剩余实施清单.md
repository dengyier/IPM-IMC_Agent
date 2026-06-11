# 天机推演算法：剩余任务实施清单

> 版本：v1.0
> 日期：2026-06-11
> 前提：阶段 1（Prompt 级多角色推演）已全部落地并贯通前后端。本清单覆盖设计方案中尚未执行的部分，按优先级排序：A → B → C → D → E → F。
> 通用守则：**所有新增字段先定 `schemas/*.py` 的 Pydantic 模型，前端 TS 类型照抄后端字段名**（参考本次 tianji 字段双轨的教训）；新增列一律走 `db/session.py` 的 `_COLUMN_ADDITIONS` 轻量迁移；所有推演链路保留 AgentRun 审计 + LLM 不可用本地兜底。

---

## 任务 A：archive_candidates 接入候选池（P0，约 0.5–1 天）

> 对应方案 §13 方法论复利、§6.3 召回原则 4。修通"复利回流"管道的最后一段：推演产出的可沉淀资产 → 候选池 → 人工审核 → 扩展层。

- [x] **A1** 抽取沉淀公共逻辑：新建 `backend/app/services/deposit_service.py`（文本 → 存档 → ExpansionSource → 吸收/审核），助手消息沉淀路由已改为复用。
- [x] **A2** 新增 `source_type="tianji_simulation"`：消息带推演结果时自动推断；沉淀文本附「可沉淀资产/路径结论/验证计划」段落；前端 `sourceTypeLabels` 加「天机推演沉淀」标签。
- [x] **A3** 触发方式（用户主动沉淀）：聊天侧复用「沉淀本回答」入口（推演面板新增可沉淀资产展示 + 提示）；报告侧新增 `POST /api/diagnosis/reports/{id}/deposit-simulation`（幂等，驳回可重提）+「沉淀推演资产到候选池」按钮。
- [x] **A4** 审核链路零改动复用：吸收走 `ExternalInfoEvolutionGraph.run_absorb`，生成 ExpansionItem + pending ReviewTask，审核台按既有流程处理。
- [x] **验收**：单元测试覆盖沉淀文本构造与来源推断（`tests/test_tianji_deposit.py`）；路由注册、前端类型检查与构建均通过。线上闭环（沉淀→审核→召回）待真实环境跑一轮确认。

## 任务 B：阶段 3 经营档案驱动推演（P1，约 2–3 天）

> 对应方案 §12、§18 阶段 3。让同一 Project 的历史判断、假设状态参与新一轮推演。

- [x] **B1** 验证卡回填字段：`ValidationCard` 增加 `result`（达成/未达成/部分达成）、`actual_outcome`（文本）、`learnings`（文本）、`validated_at`；同步 `schemas/validation.py`、`_COLUMN_ADDITIONS`、PATCH 路由、前端 `api.ts` 类型 + portfolio 验证卡回填表单。
- [x] **B2** 项目历史上下文：在 `project_service` 增加 `history_context(db, project_id) -> str`，聚合同 project 最近 3–5 份报告的 `executive_summary.one_sentence_judgement` / `key_assumptions` / `final_recommendation` + 验证卡状态汇总（含失败假设），压缩到 ~1500 字。
- [x] **B3** 注入两条链路：`TianjiSimulationService.run` 增加 `project_history` 参数并写进 prompt；聊天侧在 `assistant.py` 路由 `_project_context_for_assistant` 处拼接；诊断侧在 `BusinessCanvasDiagnosisGraph.run` 取 `request.project_id` 后注入。
- [x] **B4** 矛盾识别 + 假设追踪：`schemas/tianji.py` 的 `TianjiSimulationResult` 新增 `contradictions: list[str]`（与历史判断的前后矛盾）和 `assumption_status: list[{assumption, status, evidence}]`；prompt JSON spec 同步；前端 `api.ts` + 报告页/聊天面板渲染（字段名照抄后端）。
- [x] **B5**（可选，可推后）项目风险画像：`Project` 增加 `risk_profile` JSON 列，每次诊断完成后由 `tianji_risk_audit` 聚合更新，portfolio 项目卡展示 top 风险。
- [x] **验收**：同一项目第二次推演能引用第一次的判断；回填为"未达成"的验证卡在新推演中出现在失败假设/矛盾提示里。

## 任务 C：阶段 2 图谱增强召回（P1，约 1–2 天，可与 B 并行）

> 对应方案 §6、§18 阶段 2。现成原料：`MethodologyEdge` + `KnowledgeGraphService.neighbors(node_id)`。

- [x] **C1** `ContextFusionService.fuse` 在向量召回的 nodes 基础上做 1-hop 关系扩展：`neighbors()` 取邻接节点，relation 类型白名单（supports / depends_on / 决策顺序类优先）、每节点 top-2、总扩展上限 4–6 个、按 `edge weight × 源节点 score` 排序；扩展节点标注 `source="graph_expanded"`、score 打折。
- [x] **C2** 召回对象 5–7（历史对话/报告/验证卡）作为 L4 证据进入 `FusedContext`（复用 B2 的 history_context；B 完成后此项只是把 history 同时输出为 `evidence_refs`，类型如 `history_report` / `validation_feedback`）。
- [x] **C3** trace 与引用记录：graph 的 trace 行加"图谱扩展 N 个节点"；`TianjiEvidenceRef.type` 区分 `node` / `graph_expanded` / `history_*`，前端节点引用区可加来源小标签。
- [x] **验收**：推演 trace 显示关系扩展数量；L0/L1 优先级不被 L3/L4 覆盖（扩展节点 score 永远低于直接召回的方法论节点）；离线（无 LLM）路径不报错。

## 任务 D：角色独立性机制（P2，约 1–2 天）

> 对应方案 §20.1"推演变成表演"。当前全部角色由单次 LLM 调用生成，必须拆开。

- [x] **D1** 每角色独立 LLM 调用：`TianjiSimulationService` 拆两段——先一次调用生成 `decision_frame` + 角色清单，再按角色逐个调用（串行即可，单角色 max_tokens 调小；设总预算上限，超时角色走本地兜底）。
- [x] **D2** 角色证据过滤：给每个角色定义 `evidence_focus`（如 CFO → 单位经济/成本类节点，合规 → 监管类），按 focus 切分证据子集喂给对应角色，让分歧来自证据差异。
- [x] **D3** 同质化自检：用 `EmbeddingProvider` 算各角色 `likely_position` 两两余弦相似度，超阈值（建议 0.92）则在 trace 标记 `roles_degraded`，并入 `ReportQualityCheck` 的 issues。
- [x] **验收**：新增测试断言 4 个角色立场两两相似度低于阈值（用固定假 LLM 输出验证检测逻辑本身）；聊天延迟可接受（必要时只在诊断深度模式启用逐角色调用，聊天保持单次）。

## 任务 E：阶段 4 轻量仿真引擎——多轮辩论（P2，约 2–3 天，依赖 D）

> 对应方案 §18 阶段 4。只做诊断深度模式，不进聊天链路。

- [x] **E1** 轮次循环：最多 2–3 轮；每轮每个角色读取上一轮其他角色立场摘要，输出 `updated_position` + `conflicts_with`（指名角色与冲突点）。
- [x] **E2** 终止条件：所有角色立场与上一轮 embedding 相似度 > 0.95（已收敛）或达最大轮次。
- [x] **E3** 汇总输出：共识列表、保留分歧列表、由分歧推导的最小验证动作（直接喂给 `validation_plan` 生成）；schema 新增 `debate_rounds` / `consensus` / `disagreements` 字段（先后端后前端）。
- [x] **E4** AgentRun `intermediate_steps` 记录每轮各角色立场，便于回放调试。
- [x] **验收**：诊断报告出现共识/分歧版块；轮次与冲突记录可在 AgentRun 中追溯；总耗时和 token 预算有硬上限。

## 任务 F：成功指标埋点（P3，约 1 天）

> 对应方案 §19。先做算法侧（数据现成），用户侧依赖 B1 回填。

- [x] **F1** 算法侧：`AgentRun.output` 补充 `metrics`（节点引用数、图谱扩展数、路径数、角色数、used_llm、roles_degraded）；`dashboard_service` 加聚合查询（知识节点引用率、多路径覆盖率）。
- [x] **F2** 用户侧：验证卡生成率（卡数/推演数）、回填率（B1 后可算）、报告生成率、项目复访率（同 project 多次诊断）；data-dashboard 页加指标卡。
- [x] **F3** 沉淀侧：`tianji_simulation` 来源候选的提交数 / 审核通过率（基于 ExpansionSource 统计，A 完成后自然可算）。
- [x] **验收**：dashboard 能看到各指标近 30 天数值；指标计算口径写进本文档附录。

---

## 依赖与排期总览

```text
A（0.5–1天，独立）
B（2–3天，独立）──┐
C（1–2天，C2 复用 B2）│→ D（1–2天）→ E（2–3天）
F（1天，F2 依赖 B1，F3 依赖 A）
```

建议两个迭代：**迭代一 = A + B + C**（复利回流 + 档案驱动 + 图谱召回，约一周）；**迭代二 = D + E + F**（角色独立 + 辩论 + 指标，约一周）。

## 附录：成功指标口径（近 30 天）

- `reports`：近 30 天诊断报告数。
- `validation_card_count`：近 30 天创建的验证卡数。
- `validation_generated_rate`：验证卡数 / 诊断报告数。
- `validation_feedback_rate`：已回填 `result` 的验证卡数 / 验证卡数。
- `report_generation_rate`：诊断报告数 / 当前租户项目数。
- `project_revisit_rate`：近 30 天内报告数 ≥ 2 的项目数 / 有报告项目数。
- `knowledge_node_reference_rate`：报告引用的方法论节点数均值。
- `multi_path_coverage_rate`：`scenario_paths` 数量 ≥ 2 的报告数 / 诊断报告数。
- `avg_graph_expanded_nodes`：AgentRun metrics 中图谱扩展节点数均值。
- `avg_role_count`：AgentRun metrics 中角色数均值。
- `roles_degraded_count`：AgentRun metrics 中 `roles_degraded=true` 的次数。
- `tianji_deposit_count`：`ExpansionSource.source_type="tianji_simulation"` 的提交数。
- `tianji_deposit_approval_rate`：已吸收/通过的天机推演沉淀来源数 / 天机推演沉淀提交数。
