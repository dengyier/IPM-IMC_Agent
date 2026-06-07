"""智能助手问答 schemas。

助手用于把企业用户的自然语言诉求，路由到 IMC&IPM 核心方法论节点，
并结合 DeepSeek 输出业务解决建议。
"""

from datetime import datetime

from pydantic import BaseModel, Field


class AssistantAttachment(BaseModel):
    name: str
    chars: int | None = None
    file_id: str | None = None
    chunk_count: int | None = None
    status: str | None = None
    deposited_source_id: str | None = None
    item_count: int | None = None
    review_task_count: int | None = None
    truncated: bool = False


class AssistantAskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    company_context: str | None = None
    conversation_id: str | None = None
    attachments: list[AssistantAttachment] = Field(default_factory=list)


class AssistantParseFileResponse(BaseModel):
    """上传文件解析为会话级临时知识库，供后续问答检索。"""

    file_id: str
    conversation_id: str
    filename: str
    chars: int
    chunk_count: int
    status: str
    truncated: bool
    text: str = ""


class AssistantDepositFileRequest(BaseModel):
    """把会话临时文件沉淀为正式资料，并进入扩展审核流程。"""

    title: str | None = None
    source_type: str = "practice_feedback"
    visibility: str = "team"
    auto_absorb: bool = True


class AssistantDepositFileResponse(BaseModel):
    file_id: str
    source_id: str
    title: str
    status: str
    chunk_count: int = 0
    embedded_count: int = 0
    item_count: int = 0
    review_task_count: int = 0
    vector_backend: str | None = None
    message: str


class AssistantDepositMessageRequest(BaseModel):
    """把助手回答沉淀为正式资料，并进入扩展审核流程。"""

    title: str | None = None
    source_type: str = "practice_feedback"
    visibility: str = "team"
    auto_absorb: bool = True


class AssistantDepositMessageResponse(BaseModel):
    message_id: str
    source_id: str
    title: str
    status: str
    chunk_count: int = 0
    embedded_count: int = 0
    item_count: int = 0
    review_task_count: int = 0
    vector_backend: str | None = None
    message: str


class AssistantNodeRef(BaseModel):
    id: str
    name: str
    category: str | None = None
    score: float = 0.0


class AssistantAskResponse(BaseModel):
    conversation_id: str = ""
    assistant_message_id: str | None = None
    answer: str
    intent: str
    used_llm: bool = False
    action_label: str | None = None
    action_href: str | None = None
    node_refs: list[AssistantNodeRef] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)


class AssistantConversationCreate(BaseModel):
    title: str | None = None


class AssistantConversationOut(BaseModel):
    id: str
    title: str
    message_count: int = 0
    updated_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class AssistantMessageOut(BaseModel):
    id: str
    role: str
    content: str
    attachments: list[AssistantAttachment] = Field(default_factory=list)
    node_refs: list[AssistantNodeRef] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)
    used_llm: bool = False
    action_label: str | None = None
    action_href: str | None = None
    deposited_source_id: str | None = None
    item_count: int | None = None
    review_task_count: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
