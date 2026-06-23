import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.routers import analytics, imports, inquiries, inquiry_items, warnings
from app.routers import transfers, operation_logs, customers, factories, users, samples, productions, auth, backups
from app.routers import data_completion_tasks
from app.routers import admin_backfill_category

logger = logging.getLogger("rfq")


# ── 启动 / 关闭生命周期 ───────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 启动时：检查数据库连接 ──────────────────────────────────────────────────
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        logger.info("✓ 数据库连接正常")
    except Exception as exc:
        # 开发环境只警告不中断，生产环境可改为 raise
        logger.warning("✗ 数据库连接失败：%s", exc)

    yield  # 应用运行中

    # ── 关闭时：可在此释放连接池等资源 ─────────────────────────────────────────
    logger.info("服务关闭")


# ── FastAPI 应用 ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="询单管理系统 API",
    description="RFQ Manager MVP — 询单导入、总表查询、数据分析",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# ── 路由注册 ──────────────────────────────────────────────────────────────────

app.include_router(inquiries.router, prefix="/api/v1")
app.include_router(inquiry_items.router, prefix="/api/v1")
app.include_router(imports.router,   prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(warnings.router,  prefix="/api/v1")
app.include_router(transfers.router,       prefix="/api/v1")
app.include_router(operation_logs.router, prefix="/api/v1")
app.include_router(customers.router,      prefix="/api/v1")
app.include_router(factories.router,      prefix="/api/v1")
app.include_router(users.router,          prefix="/api/v1")
app.include_router(samples.router,        prefix="/api/v1")
app.include_router(productions.router,    prefix="/api/v1")
app.include_router(auth.router,           prefix="/api/v1")
app.include_router(backups.router,        prefix="/api/v1")
app.include_router(data_completion_tasks.router, prefix="/api/v1")
app.include_router(admin_backfill_category.router, prefix="/api/v1")


# ── 系统健康检查 ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"], summary="服务健康检查")
async def health():
    """返回服务状态和运行环境。"""
    return {"status": "ok", "env": settings.APP_ENV, "version": "1.0.0"}


@app.get("/health/db", tags=["system"], summary="数据库连接检查")
async def health_db():
    """
    测试数据库连通性，并返回当前 Alembic migration 版本。
    可用于部署后的冒烟测试。
    """
    try:
        async with AsyncSessionLocal() as session:
            # 基本连通性
            await session.execute(text("SELECT 1"))

            # 当前 migration 版本
            result = await session.execute(
                text("SELECT version_num FROM alembic_version LIMIT 1")
            )
            row = result.fetchone()
            migration_version = row[0] if row else "unknown"

            # 各表行数（快速验证数据存在）
            counts: dict[str, int] = {}
            for table in ("inquiries", "customers", "import_batches"):
                r = await session.execute(text(f"SELECT COUNT(*) FROM {table}"))
                counts[table] = r.scalar_one()

        return {
            "status": "ok",
            "db": "connected",
            "migration_version": migration_version,
            "row_counts": counts,
        }
    except Exception as exc:
        return {
            "status": "error",
            "db": "unreachable",
            "detail": str(exc),
        }
