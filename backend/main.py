import os
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from analyzer.pose_detector import (
    extract_landmarks_from_video,
    compute_angles_per_frame,
    generate_pose_gif,
    extract_phase_frame_b64,
)
from analyzer.shot_analyzer import (
    detect_shot_phases,
    extract_phase_angles,
    extract_phase_frames,
)
from analyzer.feedback_engine import analyze_form_by_phase

app = FastAPI(title="Basketball Form Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze_shot(video: UploadFile = File(...)):
    print(f"Received: {video.filename}, type: {video.content_type}")

    suffix = os.path.splitext(video.filename or "shot.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await video.read()
        print(f"File size: {len(content)} bytes")
        tmp.write(content)
        tmp_path = tmp.name

    try:
        print("Extracting landmarks...")
        frames = extract_landmarks_from_video(tmp_path)
        print(f"Frames: {len(frames)} total, {sum(1 for f in frames if f)} with pose")

        if all(f is None for f in frames):
            raise HTTPException(422, "No pose detected. Ensure your full body is visible.")

        angles_list = compute_angles_per_frame(frames)
        phases = detect_shot_phases(angles_list)
        phase_angles = extract_phase_angles(angles_list, phases)
        phase_frames = extract_phase_frames(frames, phases)

        print("Analyzing form...")
        analysis = analyze_form_by_phase(phase_angles)

        print("Generating pose GIF...")
        gif_b64 = generate_pose_gif(frames, angles_list, max_frames=30, size=(360, 360))

        print("Generating phase frames...")
        phase_images = {}
        for phase in ["ready_position", "load", "set_point", "release", "follow_through"]:
            frame_data = phase_frames.get(phase)
            angles = phase_angles.get(phase)
            user_b64, ideal_b64 = extract_phase_frame_b64(frame_data, angles, phase, size=(380, 380))
            phase_images[phase] = {"user_frame": user_b64, "ideal_frame": ideal_b64}

        analysis["pose_gif"] = gif_b64
        analysis["phase_images"] = phase_images

        print(f"Done! Overall score: {analysis['overall_score']}")
        return analysis

    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Server error: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)