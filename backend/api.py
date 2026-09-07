import logging
import os
import tempfile
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from analyzer import pose
from analyzer.pipeline import run as run_pipeline
from analyzer.registry import UnknownSport, get_plugin, list_sports

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/sports")
def sports() -> list[dict]:
    return list_sports()


@router.post("/analyze")
async def analyze_shot(
    video: Annotated[UploadFile, File()],
    sport: Annotated[str, Form()] = "",
) -> dict:
    if not sport:
        raise HTTPException(400, "sport is required")
    try:
        plugin = get_plugin(sport)
    except UnknownSport as exc:
        raise HTTPException(400, str(exc)) from exc

    suffix = os.path.splitext(video.filename or "shot.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name

    try:
        frames = await run_in_threadpool(pose.extract_landmarks_from_video, tmp_path)
        if not frames or all(f is None for f in frames):
            raise HTTPException(422, "No pose detected. Ensure your full body is visible.")
        return await run_in_threadpool(run_pipeline, frames, plugin)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("analyze failed")
        raise HTTPException(500, "Internal server error") from exc
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
