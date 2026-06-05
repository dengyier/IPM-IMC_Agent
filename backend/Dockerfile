FROM python:3.11-slim

WORKDIR /app

# 编译 psycopg / pymupdf 等可能需要的系统库
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY app ./app
# 运维/迁移脚本（重建向量、SQLite→PostgreSQL 迁移、增量入库等）一并打包，
# 便于通过 `docker compose exec api python scripts/xxx.py` 直接运行。
COPY scripts ./scripts

EXPOSE 18005
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "18005"]
