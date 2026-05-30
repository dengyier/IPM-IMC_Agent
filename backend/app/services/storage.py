from pathlib import Path
from uuid import uuid4


class LocalStorage:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, filename: str, content: bytes) -> Path:
        suffix = Path(filename).suffix.lower()
        path = self.root / f"{uuid4()}{suffix}"
        path.write_bytes(content)
        return path
