# 天机AI商业决策智能体：天机推演算法设计方案 v2

> 版本：v2.0
> 日期：2026-06-12
> 前置文档：《天机AI-天机推演算法设计方案》（v0.1，Tianji-MPS）
> 定位：将 v1 的「单次生成式推演」升级为「假设驱动、证据可计量、可自我校准的决策引擎」。
> 算法代号：**Tianji-BACH**（Tianji Bayesian Analysis of Competing Hypotheses）

---

## 1. v1 问题诊断（为什么要 v2）

v1（`tianji_simulation_service.py`，算法版本 Tianji-MPS）实测确认存在五个结构性问题：

| # | 问题 | 表现 | 根因 |
|---|------|------|------|
| 1 | 一口气生成 | 验证任务泛化、不落地（"访谈8-12个客户"） | 推演与信息搜集发生在同一个 prompt 内，模型从未"查过"任何事实 |
| 2 | 辩论是模板 | `_debate_round` 用字符串拼接生成立场，冲突关系硬编码 | LLM 从不参与辩论；收敛判定比较的是同一模板生成的文本 |
| 3 | 置信度自报 | confidence 0.9/0.8 由 LLM 嘴上说出 | 无任何数学依据，不可校准、不可审计 |
| 4 | 角色不独立 | 需要"角色独立性审计"事后补救 | 同一模型扮演多角色，输出天然相关（受控研究证实 MAD 经常打不过单模型，见 §14 参考文献 [7][8]） |
| 5 | 与验证闭环断裂 | `assumption_status` 靠子串匹配"未达成" | 验证卡的真实证据（evidence_items）、Day7 复盘从未回流到推演 |

**v2 的判据：用户看到的每一个数字（置信度、回本概率、动作优先级）都必须来自公式，而不是来自模型的嘴。**

---

## 2. 设计公理

1. **数学骨架，LLM 器官**。假设状态、置信度更新、动作排序、量化模拟、评分校准是确定性代码；LLM 只负责语义工作（提假设、抽证据、估似然比、写文案）。
2. **一切数字来自公式**。LLM 的每次输出只是向证据账本添加一条带似然比的记录；数字如何变化由 log-odds 算术决定。
3. **独立性来自异构性**。多视角判断由"不同模型家族"承担，而不是"同一模型扮演不同角色"；角色（CFO/客户/竞对）降级为证据分配维度。
4. **系统必须给自己打分**。每次裁决是一次可评分预测；Day7 复盘的真实结果回流，用 Brier 分数评估并校准后续置信度。

---

## 3. 总体架构（六层闭环）

```text
病例库先验（参考类基率）
        │
        ▼
[1] 假设树框架层  ──── 决策问题 → 可证伪假设集 + 先验置信度（持久化状态）
        │
        ├──────────────► [2] 情报循环层（迭代）
        │                    四路信源定向检索 → 证据入账 → 置信度更新
        │                    → 缺口派生新检索 → 预算止损
        │
        └──────────────► [3] 推演层（三引擎）
                             3a 异构模型评审（替代角色辩论）
                             3b 情景前推（分支/触发器/先行指标）
                             3c 量化沙盘（蒙特卡洛单位经济）
        │
        ▼
[4] 裁决层  ──── 加权综合 · 校准置信度 · 终止条件（kill criteria）
        │
        ▼
[5] 落地层  ──── 验证动作绑定假设，EVOI 排序，落地契约三字段
        │
        ▼
[6] 闭环层  ──── 验证回填 → 假设状态更新 → Day7 复盘 → Brier 评分
        │                                          │
        └── 增量重推演（只重算受影响子树） ◄────────┘
                       病例沉淀 → 校准先验（回到顶部）
```

---

## 4. 核心数据结构

### 4.1 假设节点 HypothesisNode（新表 `tianji_hypotheses`）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | str(36) | 主键 |
| case_id | str(36) | 所属决策案例（关联 project / validation_card） |
| parent_id | str(36)? | 父假设（树结构） |
| statement | text | 假设陈述，必须**可证伪**（"目标客户愿意为 X 支付 ≥ Y 元"，而非"市场有需求"） |
| dimension | str | 假设维度：customer_demand / willingness_to_pay / channel / unit_economics / delivery / competition / compliance |
| prior_logodds | float | 先验对数几率（来自参考类基率，见 §9.1） |
| current_logodds | float | 当前对数几率（由证据账本累加得出，只读派生值） |
| impact_weight | float | 对最终裁决的影响力 0~1（敏感性分析得出，见 §8.2） |
| status | str | open / supported / refuted / stale |
| created_at / updated_at | datetime | |

置信度换算：`P = 1 / (1 + 10^(-logodds))`（以 10 为底，便于人读：log-odds +1 = 几率×10）。

### 4.2 证据记录 EvidenceRecord（新表 `tianji_evidence_ledger`）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | str(36) | 主键 |
| case_id / hypothesis_id | str(36) | 归属 |
| content | text | 证据原文（一句话事实，非推断） |
| source_type | str | internal_kg / project_evidence / external_search / user_input / case_library |
| source_ref | str | 来源定位（节点 id / 验证卡动作 / URL / 病例 id） |
| grade | str | A / B / C / D（沿用现有证据等级体系，定义见 §5.2） |
| log_lr_raw | float | 评审聚合后的对数似然比（多模型稳健聚合，见 §7） |
| log_lr_effective | float | 实际入账值 = raw × 同源折减系数（见 §5.4），受等级上限截断 |
| reviewer_spread | float | 评审分歧度（多模型估计的极差），> 阈值时标记 disputed |
| created_at | datetime | |

### 4.3 预测记录 PredictionRecord（新表 `tianji_predictions`）

| 字段 | 类型 | 说明 |
|------|------|------|
| id / case_id | str(36) | |
| verdict | str | continue / adjust / pause |
| probability | float | 裁决时的综合置信度（校准后） |
| probability_raw | float | 校准前原始值（留作校准训练数据） |
| kill_criteria | json | 触发即停的信号清单 |
| outcome | str? | Day7 复盘回填的真实结果 |
| brier | float? | (probability − outcome)²，回填后计算 |
| created_at / resolved_at | datetime | |

---

## 5. 算法 A：BACH 假设树（地基）

### 5.1 假设生成规范

由主生成模型（DeepSeek V4 Pro）从决策问题产出 4~7 个假设，硬性要求：

1. **可证伪**：每个假设必须能写出"什么证据会推翻它"。
2. **维度覆盖**：customer_demand 与 willingness_to_pay 必须出现；其余按意图路由选配。
3. **互不蕴含**：任何一个假设的真伪不能逻辑上决定另一个（生成后由评审模型校验一次）。
4. 每个假设附带 `falsified_by`（何种观测推翻它）与 `validated_by`（何种观测支持它）——它们就是后续验证动作的种子。

### 5.2 证据等级 → 似然比上限映射（核心表）

证据等级沿用现有 A/B/C/D 体系，赋予数学含义——**等级决定一条证据最多能撬动多少置信度**：

| 等级 | 定义 | log₁₀LR 上限 | 单条最大撬动力（几率） | 示例 |
|------|------|--------------|------------------------|------|
| A | 行为性 · 不可逆（真实付款、签约、已交付复购） | ±1.0 | ×10 / ÷10 | 客户支付全款；渠道签订分成协议 |
| B | 行为性 · 可逆（订金、预约、留资、试用激活） | ±0.7 | ×5 / ÷5 | 预付可退订金 500 元；30 人留下联系方式 |
| C | 言语性 · 具体（访谈中给出数字、预算、流程细节） | ±0.5 | ×3 / ÷3 | "我们每月因此损失约 2 万"；竞品报价单 |
| D | 言语性 · 泛化（兴趣表达、点赞、转发、口头认可） | ±0.18 | ×1.5 / ÷1.5 | "这个想法不错"；朋友圈点赞 50 个 |

设计依据：等级间撬动力呈几何级差（10/5/3/1.5），意味着**一条 A 级证据 ≈ 13 条 D 级证据**——这把"口头兴趣堆不出立项依据"从纪律变成了算术。

### 5.3 置信度更新（确定性代码）

```text
logodds(H) = prior_logodds(H) + Σᵢ log_lr_effective(Eᵢ)
P(H) = 1 / (1 + 10^(−logodds))
```

更新在证据入账时同步执行，O(1) 增量计算；任何时刻可由账本全量重放复现（可审计性）。

### 5.4 同源折减（防刷分）

同一 source_ref 下的第 k 条同向证据：

```text
log_lr_effective = log_lr_raw × ρ^(k−1)，ρ = 0.6
```

10 条来自同一渠道的 D 级证据 ≈ 2.5 条的效力，防止"找十个朋友说好话"推高置信度。
反向证据（与该源此前方向相反）不折减——坏消息全额入账，这是"冷酷"的算法表达。

### 5.5 示例 walk-through

决策："是否投入 30 万启动 GEO 服务产品化"。假设 H₂ = "目标企业愿意为 GEO 优化年付 ≥ 3 万"。

| 事件 | 等级 | log LR | H₂ 置信度变化 |
|------|------|--------|----------------|
| 先验（病例库同类项目付费转化基率 25%） | — | prior = −0.48 | 25% |
| 访谈：客户 A 说"这正是我们的痛点"（言语泛化） | D | +0.15 | 29% |
| 客户 A 同一来源再夸两句 | D | +0.09（折减） | 31% |
| 客户 B 给出预算数字"每年最多 2 万"（具体但低于假设阈值） | C | −0.35 | 18% |
| 客户 C 支付 3000 元订金锁定首期 | B | +0.65 | 41% |

裁决层看到的是 41% 及其完整推导链——而不是 LLM 说的"76%"。

---

## 6. 算法 B：情报循环（AIA Forecaster 模式）

参照 AIA Forecaster 配方（agentic search + supervisor + statistical calibration，ForecastBench 上达到超级预测者水平，见 [4]）：

### 6.1 流程

```text
repeat:
  1. 从假设树选取 U(H) 最高的假设（U = 4·P·(1−P)，在 P=0.5 处最大）
  2. 由检索模型（DeepSeek V4 Flash）生成 ≤3 个定向检索任务
  3. 四路执行：
     a. 内部知识图谱 / 已审核案例     （context_fusion_service，已有）
     b. 项目真实证据：验证卡 evidence_items、Day7 复盘（已有，今日打通）
     c. 外部搜索：竞品 / 渠道报价 / 行业数据（需接入搜索 API，阶段二）
     d. 用户追问：无法检索的事实生成提问卡，阻塞该假设但不阻塞流程
  4. 抽取候选证据 → 评审定级估 LR（§7）→ 入账 → 置信度更新
until 止损条件
```

### 6.2 止损条件（预算控制）

满足任一即停：
- 全部高影响假设（impact_weight ≥ 0.5）的 U(H) < 0.6（即 P 已离开 35%~65% 灰区）；
- 单案例检索调用 ≥ N_max（默认 10）；
- 最近一轮全部证据 |log LR effective| < 0.05（边际信息价值耗尽）。

### 6.3 监督者调和

每轮结束，监督者模型扫描新入账证据，标记互相矛盾的证据对（同假设、方向相反、均 ≥ C 级）。矛盾对**不抵消、不删除**，而是生成"冲突点"对象——冲突点直接进入落地层成为最高优先级验证任务（信息矛盾处 = 最大不确定性 = 最值得花钱验证的地方）。

---

## 7. 算法 C：异构模型评审（替代角色辩论）

### 7.1 为什么砍掉角色辩论

受控研究（[7][8]）表明同模型多角色辩论（MAD）经常不优于单模型多算一会儿：同一模型的"不同角色"共享同一套先验，输出相关。v1 需要"角色独立性审计"恰是此病的症状。**独立性必须来自模型异构性。**

### 7.2 评审流程

对每条候选证据，3 个不同家族的模型独立输出：

```json
{"grade": "C", "log_lr": -0.35, "direction": "refutes", "rationale": "预算低于假设阈值"}
```

- 提示采用对比式（contrastive prompting，见 [6]）："这条证据在 H 为真的世界 vs H 为假的世界中出现的相对可能性"；
- 聚合：log_lr 取**中位数**，grade 取**最严格者**（截断上限以最严格等级为准）；
- 分歧度 reviewer_spread = max − min；spread > 0.6 标记 disputed，降权 50% 并在前端展示分歧。

### 7.3 角色的去向

角色（CFO/目标客户/竞争对手…）保留为**证据分配维度与展示视角**：每个维度的证据子集 + 该维度置信度构成"角色卡片"展示给用户，但不再有模型扮演角色互相喊话。

---

## 8. 算法 D：EVOI 验证动作排序（落地层）

### 8.1 优先级公式

理论形式：VOI(action) = E[max_a EU(a | posterior)] − max_a EU(a | prior)。
工程近似：

```text
Priority(action) = impact_weight(H) × U(H) / cost(action)
U(H) = 4 · P(H) · (1 − P(H))        # 不确定性，P=0.5 时最大
cost  = 预估人天 × 直接花费系数
```

### 8.2 impact_weight 的计算（敏感性分析）

对每个假设 H：将 P(H) 强制置 0 和置 1，分别重跑裁决函数（§9），若裁决翻转则 impact_weight = 1.0；若仅置信度变化则取 |Δ综合置信度| 归一化。确定性计算，无 LLM 参与。

### 8.3 落地契约（验证动作 schema 增三个必填字段）

| 字段 | 含义 | 约束 |
|------|------|------|
| grounded_on | 依据账本中哪条证据/冲突点（evidence_id 列表） | 空则该动作**不允许生成**，降级为"需要你补充"提问卡 |
| target | 具体对象：找谁访谈 / 测哪个渠道 / 对标什么价格 | 必须含专名或可执行定位 |
| baseline | 成功标准中的数字来自哪个基线（证据 id 或病例基率） | 数字不许凭空出现 |

**宁可追问，不可编造**——这是消灭"访谈8-12个目标客户"式空话的机制保证。

---

## 9. 算法 E：裁决与校准

### 9.1 参考类先验（外部视角优先）

裁决前先取病例库参考类：按行业 × 任务包 × 决策类型检索相似已复盘病例，基率 = 该类病例中 continue 且后续达成的比例。病例数 < 3 时回退到全局基率，并在输出中声明"参考类样本不足"。该基率即假设树的 prior_logodds 来源。

### 9.2 综合裁决（确定性函数）

```text
P_overall = Σ impact_weight(H) · P(H) / Σ impact_weight(H)
P_overall ≥ 0.70           → 可小额继续验证（continue-small）
0.40 ≤ P_overall < 0.70    → 调整后再投入（adjust）
P_overall < 0.40           → 暂不建议直接投入（pause）
任一 impact=1.0 假设被 A/B 级证据证伪 → 直接 pause（一票否决）
```

### 9.3 Kill criteria（自动生成）

对每个 impact_weight ≥ 0.5 的假设，取其 `falsified_by` 字段生成止损信号："若验证中观测到 X（达到 B 级证据强度），立即停止投入"。随验证卡一起展示。

### 9.4 量化沙盘（蒙特卡洛，无 LLM）

- 参数来自证据账本中的区间型事实（客单价、转化率、CAC、交付成本），三点估计 PERT 分布；
- N = 10,000 次模拟，输出：`P(回本周期 ≤ 决策期限)`、`P(现金流耗尽 < 6 个月)`、敏感性排序（tornado）；
- 缺参数时输出"沙盘不可用：缺少 X"——**不允许编造参数**；
- 沙盘结果作为 unit_economics 维度假设的一条 B 级证据入账（模拟即行为性推演）。

### 9.5 校准闭环

- 每次裁决写入 PredictionRecord；Day7 复盘回填 outcome，计算 Brier = (p − outcome)²；
- 仪表盘展示滚动 Brier 与校准曲线（按 P 分桶的预测 vs 实际命中率，ECE）；
- 累计 ≥ 20 条已回填记录后，启用 Platt 缩放对 probability_raw 做事后校准；
- **这是"天机随使用变准"的机制本体。**

---

## 10. 模型池（2026-06 选型）

| 用途 | 模型 | 理由 | 调用强度 |
|------|------|------|----------|
| 主生成 / 编排 / 假设生成 | DeepSeek V4 Pro（现役） | 中文综合榜第一 | 低频，关键节点 |
| 评审 #2（异构） | Kimi K2.6 | 推理基准领先 | 每条证据 1 次 |
| 评审 #3（异构）/ 数学校验 | GLM-5 Reasoning | 数学最强；或 Step 3.5 Flash 控成本 | 每条证据 1 次 |
| 情报循环批量检索 / 抽取 | DeepSeek V4 Flash | 调用量大，用便宜档 | 高频 |
| 长文档探查（行业报告） | Qwen 3.6 Plus | 1M 上下文 | 按需 |

全部提供 OpenAI 兼容 API。工程改造：`llm.py` 从单例改为模型池（`LLMService` 按 profile 实例化：`generator / reviewer_a / reviewer_b / retriever / longdoc`），配置项进 `Settings`，缺哪个 key 该 profile 自动降级到 generator——**保持"无 key 也能跑"的项目惯例**。

---

## 11. 分级触发策略（成本预算）

| 场景 | 路径 | LLM 调用量 | 预期时延 |
|------|------|-----------|----------|
| 日常聊天追问 | 轻量：读取已有假设树状态 + 单次生成回答 | 1~2 次 | 秒级 |
| 创建 7 天验证任务 | 全量：六层完整流程 | 15~25 次 | 1~3 分钟（流式展示探查进度） |
| 验证证据回填 | 增量：仅重算受影响假设子树 + 必要时重裁决 | 0~4 次 | 秒级 |
| Day7 复盘 | 闭环：评分 + 病例沉淀 + 校准数据入库 | 1~2 次 | 秒级 |

全量路径必须流式输出阶段事件（前端已有 phase 事件机制）："正在检索渠道报价…/ 评审分歧：客户付费意愿（2:1）…"——让用户**看见**系统在分头搜集信息。

---

## 12. 与现有代码的映射

| v2 组件 | 现有资产 | 改造量 |
|---------|----------|--------|
| 假设树 / 证据账本 / 预测记录 | 无 | 新增 3 张表 + service |
| 内部信源检索 | `context_fusion_service` | 复用 |
| 项目真实证据 | 验证卡 `evidence_items`（2026-06-12 已打通） | 接入账本 |
| 病例库参考类 | `decision_case_service` | 增加按维度基率统计 |
| 模型池 | `llm.py`（OpenAI 兼容单例） | 单例 → 多 profile |
| 编排 | `graphs/` 已有 LangGraph 先例 | 新增推演图 |
| 推演结果展示 | `tianji_simulation` 字段 + 前端组件 | schema 扩展，保留兼容 |
| 验证卡生成 | `validation_card_service`（已接 LLM） | 落地契约三字段 + EVOI 排序 |
| 外部搜索 | 无 | 阶段二接入（博查/Tavily 选型） |

---

## 13. 实施路线图

| 阶段 | 内容 | 验收标准 |
|------|------|----------|
| P1 地基 | 假设树/证据账本/预测记录三表 + log-odds 引擎 + 等级→LR 映射 + 验证卡证据流入账 | 同一案例的置信度可由账本全量重放复现；加一条 B 级证据，工作台置信度按公式变化 |
| P2 评审 | 模型池改造 + 异构三模型证据评审 + 稳健聚合 + 分歧标记 | 同一证据三模型估值入库，中位数入账；disputed 证据前端可见 |
| P3 落地 | EVOI 排序 + 落地契约三字段 + 冲突点 → 验证任务 | 生成的验证动作 100% 带 grounded_on/target/baseline，否则转提问卡 |
| P4 沙盘+裁决 | 蒙特卡洛 + 敏感性 impact_weight + 裁决函数 + kill criteria | "30 万回本概率"以分布呈现；裁决理由可追溯到具体假设 |
| P5 闭环 | 外部搜索接入 + Brier 仪表盘 + Platt 校准 + 增量重推演 | Day7 回填自动评分；≥20 案例后校准生效 |

P1 不依赖任何新外部服务，是其他所有阶段的地基，**先行实施**。

---

## 14. 评估方案

- **离线评估集**：挑 15~20 个真实历史决策问题（含已知结局的），冻结为评估集；
- **指标**：验证动作落地率（带齐三契约字段且人工判定可执行的比例）、证据引用率、裁决 Brier（对已知结局案例）、全量推演时延与成本；
- **对照**：v1（Tianji-MPS）作为 baseline，同题对比；
- 任何后续算法改动必须先过评估集，防止"感觉变好了"。

---

## 15. 参考文献

1. ForecastBench：LLM 预测能力基准与超级预测者差距分析 — https://forecastingresearch.substack.com/p/ai-llm-forecasting-model-forecastbench-benchmark
2. Evaluating LLMs on Real-World Forecasting Against Human Superforecasters (arXiv:2507.04562) — https://arxiv.org/html/2507.04562v1
3. Training LLMs to Predict World Events — Thinking Machines Lab × Mantic — https://thinkingmachines.ai/news/training-llms-to-predict-world-events/
4. AIA Forecaster：agentic search + supervisor + statistical calibration 达到超级预测者水平（见 [1] 综述）
5. BACH: Bayesian Analysis of Competing Hypotheses — https://www.researchgate.net/publication/335824807
6. Bayesian Orchestration of Multi-LLM Agents for Cost-Aware Sequential Decision-Making (arXiv:2601.01522) — https://arxiv.org/abs/2601.01522
7. Can LLM Agents Really Debate? A Controlled Study of Multi-Agent Debate (arXiv:2511.07784) — https://arxiv.org/pdf/2511.07784
8. Multi-LLM-Agents Debate: Performance, Efficiency, and Scaling Challenges — ICLR Blogposts 2025 — https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/
9. Structuring and analyzing competing hypotheses with Bayesian networks — https://www.sciencedirect.com/science/article/abs/pii/S2193943821000194
10. 中文模型版图（2026-06）：BenchLM 榜单 — https://benchlm.ai/blog/posts/best-chinese-llm ；API 成本对比 — https://global-apis.com/blog/deepseek-vs-qwen-vs-kimi-vs-glm-2026
