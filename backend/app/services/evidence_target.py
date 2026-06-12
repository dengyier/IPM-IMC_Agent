"""Infer evidence target counts from validation action text."""

from __future__ import annotations

import re


DEFAULT_EVIDENCE_TARGET = 3
_MAX_EVIDENCE_TARGET = 200

_CN_NUMBERS = {
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
}


def infer_evidence_target(*texts: object, explicit: object = None, default: int = DEFAULT_EVIDENCE_TARGET) -> int:
    """Return the minimum evidence count implied by action text.

    The parser intentionally only accepts count-like units, so percentages,
    money and day ranges do not become evidence targets.
    """
    explicit_value = _to_int(explicit)
    if explicit_value is not None and explicit_value > 0:
        return min(explicit_value, _MAX_EVIDENCE_TARGET)

    candidates: list[int] = []
    text = "；".join(str(item or "") for item in texts)
    for raw, unit in re.findall(r"([0-9]+|[一二两三四五六七八九十]+)\s*(位|名|人|个|家|条|次|份|组|批)", text):
        value = _parse_number(raw)
        if value is None:
            continue
        # “30天/70%/30万”不会被上面的单位匹配；这里保留语义上的计数单位。
        candidates.append(value)
    if candidates:
        return min(max(candidates), _MAX_EVIDENCE_TARGET)
    return max(1, default)


def _parse_number(value: str) -> int | None:
    parsed = _to_int(value)
    if parsed is not None:
        return parsed
    if value in _CN_NUMBERS:
        return _CN_NUMBERS[value]
    if value.startswith("十") and len(value) == 2:
        tail = _CN_NUMBERS.get(value[1])
        return 10 + tail if tail is not None else None
    if value.endswith("十") and len(value) == 2:
        head = _CN_NUMBERS.get(value[0])
        return head * 10 if head is not None else None
    if "十" in value:
        head, _, tail = value.partition("十")
        head_value = _CN_NUMBERS.get(head, 1 if not head else None)
        tail_value = _CN_NUMBERS.get(tail, 0 if not tail else None)
        if head_value is not None and tail_value is not None:
            return head_value * 10 + tail_value
    return None


def _to_int(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
