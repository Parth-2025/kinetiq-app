import logging
import os
import tempfile
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from analyzer import pose, rendering
from analyzer.angles import angles_per_frame
from analyzer.phases import extract_phase_angles, segment_phases
from analyzer.scoring import analyze

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.post("/analyze")
async def analyze_shot(video: Annotated[UploadFile, File()]) -> dict:
    suffix = os.path.splitext(video.filename or "shot.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await video.read())
        tmp_path = tmp.name

    try:
        frames = await run_in_threadpool(pose.extract_landmarks_from_video, tmp_path)
        if not frames or all(f is None for f in frames):
            raise HTTPException(422, "No pose detected. Ensure your full body is visible.")

        angles_list = angles_per_frame(frames)
        seg = segment_phases(angles_list)
        phase_angles = extract_phase_angles(angles_list, seg["phases"])
        result = analyze(phase_angles)

        result["pose_gif"] = await run_in_threadpool(
            rendering.generate_pose_gif, frames, angles_list
        )
        result["phase_images"] = await run_in_threadpool(
            rendering.render_phase_images, frames, angles_list, seg["phases"], phase_angles
        )
        result["camera_view"] = seg["camera_view"]
        result["confidence"] = round(seg["confidence"], 4)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("analyze failed")
        raise HTTPException(500, "Internal server error") from exc
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
