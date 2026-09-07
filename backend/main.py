from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import router as analyze_router
from routers.profile import router as profile_router
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
