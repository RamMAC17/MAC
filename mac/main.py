"""
MAC — MBM AI Cloud
Self-hosted AI inference platform.
"""

import pathlib
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from mac.config import settings
from mac.database import init_db
from mac.routers import (
    auth, explore, query, usage,
    models, integration, keys, quota,
    guardrails, rag, search,
)

FRONTEND_DIR = pathlib.Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events."""
    # Import all models so Base.metadata knows about them
    import mac.models.user  # noqa: F401
    import mac.models.guardrail  # noqa: F401
    import mac.models.quota  # noqa: F401
    import mac.models.rag  # noqa: F401

    # Create tables (dev only — production uses Alembic)
    if settings.is_dev:
        await init_db()
        # Seed a test user if DB is empty
        await _seed_dev_user()
    yield


app = FastAPI(
    title="MAC — MBM AI Cloud",
    description="Self-hosted AI inference platform for MBM Engineering College. "
                "OpenAI-compatible API powered by open-source models.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers under /api/v1
app.include_router(auth.router, prefix="/api/v1")
app.include_router(explore.router, prefix="/api/v1")
app.include_router(query.router, prefix="/api/v1")
app.include_router(usage.router, prefix="/api/v1")
app.include_router(models.router, prefix="/api/v1")
app.include_router(integration.router, prefix="/api/v1")
app.include_router(keys.router, prefix="/api/v1")
app.include_router(quota.router, prefix="/api/v1")
app.include_router(guardrails.router, prefix="/api/v1")
app.include_router(rag.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")

# Serve frontend static files
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# ── Rate-limit header injection ─────────────────────────

@app.middleware("http")
async def inject_rate_limit_headers(request: Request, call_next):
    response = await call_next(request)
    headers = getattr(request.state, "rate_limit_headers", None)
    if headers:
        for key, value in headers.items():
            response.headers[key] = value
    return response


# ── Global error handler ────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": str(exc) if settings.is_dev else "An internal error occurred",
                "status": 500,
            }
        },
    )


# ── Root ─────────────────────────────────────────────────

@app.get("/")
async def root():
    if FRONTEND_DIR.exists():
        return FileResponse(str(FRONTEND_DIR / "index.html"))
    return {
        "name": "MAC — MBM AI Cloud",
        "version": "1.0.0",
        "docs": "/docs",
        "api": "/api/v1",
    }


@app.get("/api/v1")
async def api_root():
    return {
        "message": "MAC API v1",
        "endpoints": {
            "auth": "/api/v1/auth",
            "explore": "/api/v1/explore",
            "query": "/api/v1/query",
            "usage": "/api/v1/usage",
            "models": "/api/v1/models",
            "integration": "/api/v1/integration",
            "keys": "/api/v1/keys",
            "quota": "/api/v1/quota",
            "guardrails": "/api/v1/guardrails",
            "rag": "/api/v1/rag",
            "search": "/api/v1/search",
        }
    }


# ── Dev seed ─────────────────────────────────────────────

async def _seed_dev_user():
    """Seed admin (Abhishek Gaur) + test students in dev mode."""
    from datetime import date
    from mac.database import async_session
    from mac.services.auth_service import get_user_by_roll, create_user, get_registry_entry
    from mac.models.user import StudentRegistry

    async with async_session() as db:
        # ── 1) Super Admin: Abhishek Gaur ──────────────────
        admin_existing = await get_user_by_roll(db, "abhisek.cse@mbm.ac.in")
        if not admin_existing:
            admin = await create_user(
                db,
                roll_number="abhisek.cse@mbm.ac.in",
                name="Prof. Abhishek Gaur",
                password="MBM@admin2026",
                department="CSE",
                role="admin",
                must_change_password=True,
                email="abhisek.cse@mbm.ac.in",
            )
            print(f"  [SEED] Super Admin: {admin.roll_number} / MBM@admin2026  (must change on first login)")
            print(f"  [SEED] Admin API key: {admin.api_key}")

        # ── 2) Student Registry (sample entries) ──────────
        #    Admin also needs a registry entry for unified DOB verify flow
        sample_students = [
            ("abhisek.cse@mbm.ac.in", "Prof. Abhishek Gaur", "CSE", date(1990, 1, 1), 2020),
            ("21CS045", "Test Student", "CSE", date(2003, 8, 15), 2021),
            ("21CS001", "Aarav Sharma", "CSE", date(2003, 1, 10), 2021),
            ("21ME010", "Priya Patel", "ME", date(2003, 5, 22), 2021),
            ("22EC030", "Rahul Verma", "ECE", date(2004, 3, 8), 2022),
            ("22CE015", "Neha Singh", "CE", date(2004, 11, 30), 2022),
        ]
        for roll, name, dept, dob, batch in sample_students:
            existing = await get_registry_entry(db, roll)
            if not existing:
                db.add(StudentRegistry(
                    roll_number=roll, name=name, department=dept, dob=dob, batch_year=batch,
                ))

        await db.commit()
        print("  [SEED] Student registry seeded with sample entries")
