from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import router as analyze_router
from routers.profile import router as profile_router
from routers.sessions import router as sessions_router
from routers.sports import router as sports_router
from routers.stats import router as stats_router
from settings import settings

app = FastAPI(title="KinetiQ Shot Analyzer")
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
