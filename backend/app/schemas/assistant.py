"""智能助手问答 schemas。

助手用于把企业用户的自然语言诉求，路由到 IMC&IPM 核心方法论节点，
并结合 DeepSeek 输出业务解决建议。
"""

from datetime import datetime

from pydantic import BaseModel, Field


class AssistantAttachment(BaseModel):
    name: str
    chars: int | None = None
    truncated: bool = False


class AssistantAskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    company_context: str | None = None
    conversation_id: str | None = None
    attachments: list[AssistantAttachment] = Field(default_factory=list)


class AssistantParseFileResponse(BaseModel):
    """上传文件解析为纯文本，供前端作为问答的 company_context 一起发送。"""

    filename: str
    chars: int
    truncated: bool
    text: str


class AssistantNodeRef(BaseModel):
    id: str
    name: str
    category: str | None = None
    score: float = 0.0


class AssistantAskResponse(BaseModel):
    conversation_id: str = ""
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
    created_at: datetime

    model_config = {"from_attributes": True}
