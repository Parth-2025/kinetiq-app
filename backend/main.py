import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from api import router as analyze_router
from db.session import engine
from routers.profile import router as profile_router
from routers.sessions import router as sessions_router
from routers.sports import router as sports_router
from routers.stats import router as stats_router
from studio.router import router as studio_router
from studio.coaching_routes import router as coaching_router
from studio.data_routes import router as data_router
from studio.claim_routes import router as claim_router
from studio.comparison_routes import router as comparison_router
from studio.practice_capture_routes import router as practice_capture_router
from studio.sensor_routes import router as sensor_router
from studio.deletion_routes import router as deletion_router
from studio.tracking_routes import router as tracking_router
from studio.motion_routes import router as motion_router
from studio.session_query_routes import router as session_query_router
from studio.rig_routes import router as rig_router
from studio.shot_routes import router as shot_router
from settings import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("database reachable")
    except Exception:
        logger.exception("database unreachable at startup — /me/* routes will 503")
    yield


app = FastAPI(title="KinetiQ Shot Analyzer", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(analyze_router)
app.include_router(profile_router)
app.include_router(sports_router)
app.include_router(sessions_router)
app.include_router(stats_router)
app.include_router(studio_router)
app.include_router(coaching_router)
app.include_router(data_router)
app.include_router(claim_router)
app.include_router(comparison_router)
app.include_router(practice_capture_router)
app.include_router(sensor_router)
app.include_router(deletion_router)
app.include_router(tracking_router)
app.include_router(motion_router)
app.include_router(session_query_router)
app.include_router(rig_router)
app.include_router(shot_router)
