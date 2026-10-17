"""Run with `python -m studio.worker`. Jobs are queued durably in PostgreSQL.

An advisory lock prevents two workers from processing the same session, releases
on crash, and permits a replacement worker to recover an interrupted job.
"""
import datetime as dt
import json
import logging
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

from sqlalchemy import select, text
from db.session import SessionLocal, engine
from settings import settings
from studio.models import TrainingSession

logger = logging.getLogger(__name__)
MAX_ANALYSIS_RESULT_BYTES = 8 * 1024 * 1024
ANALYSIS_FAILURE = "Analysis could not finish. Try a new recording."


def _valid_analysis(value):
    return (isinstance(value, dict) and value.get("version") == "studio-motion-1"
            and isinstance(value.get("frames"), list) and isinstance(value.get("summary"), dict)
            and isinstance(value.get("repetitions"), list))


def analyze_isolated(path, side, *, runner=subprocess.run, timeout=None):
    """Run one native analysis in a killable child and validate its bounded output."""
    timeout = timeout or settings.studio_analysis_timeout_seconds
    with tempfile.TemporaryDirectory(prefix="kinetiq-studio-analysis-") as tmp:
        result_path = Path(tmp) / "result.json"
        command = [sys.executable, "-m", "studio.analyze_job", str(path), side, str(result_path)]
        try:
            completed = runner(command, capture_output=True, timeout=timeout, check=False)
        except subprocess.TimeoutExpired as exc:
            logger.warning("Studio analysis subprocess timed out after %ss", timeout)
            raise RuntimeError(ANALYSIS_FAILURE) from exc
        except Exception as exc:
            logger.warning("Studio analysis subprocess could not start (%s)", type(exc).__name__)
            raise RuntimeError(ANALYSIS_FAILURE) from exc
        if completed.returncode != 0:
            logger.warning("Studio analysis subprocess exited with status %s", completed.returncode)
            raise RuntimeError(ANALYSIS_FAILURE)
        try:
            size = result_path.stat().st_size
            if size <= 0 or size > MAX_ANALYSIS_RESULT_BYTES:
                raise ValueError("invalid result size")
            result = json.loads(result_path.read_text(encoding="utf-8"))
            if not _valid_analysis(result):
                raise ValueError("invalid result shape")
            return result
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
            logger.warning("Studio analysis subprocess returned invalid result (%s)", type(exc).__name__)
            raise RuntimeError(ANALYSIS_FAILURE) from exc


def expire_orphans():
    cutoff = time.time() - 24 * 60 * 60
    if not settings.studio_media_dir.exists():
        return
    for path in settings.studio_media_dir.iterdir():
        if path.suffix not in (".upload", ".video"):
            continue
        try:
            session_id = uuid.UUID(path.name.split(".")[0])
            with SessionLocal.begin() as db:
                # Serialize cleanup with uploads; recheck age while holding the row lock.
                item = db.get(TrainingSession, session_id, with_for_update=True)
                if item and item.status in ("queued", "processing"):
                    continue
                if path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
        except (FileNotFoundError, ValueError):
            continue


def process_one():
    with SessionLocal() as db:
        ids = list(db.scalars(select(TrainingSession.id).where(TrainingSession.status.in_(["queued", "processing"])).order_by(TrainingSession.created_at).limit(30)))
    for session_id in ids:
        key = int.from_bytes(session_id.bytes[:8], "big", signed=True)
        with engine.connect() as lock_connection:
            locked = lock_connection.scalar(text("SELECT pg_try_advisory_lock(:key)"), {"key": key})
            if not locked:
                continue
            try:
                with SessionLocal.begin() as db:
                    item = db.get(TrainingSession, session_id, with_for_update=True)
                    if not item or item.status not in ("queued", "processing"):
                        continue
                    item.status = "processing"
                    side = item.source.get("dominant_side", "unknown")
                    path = settings.studio_media_dir / f"{session_id}.video"
                    uploaded_at = item.source.get("uploaded_at", item.created_at.isoformat())
                try:
                    uploaded = dt.datetime.fromisoformat(uploaded_at)
                    if dt.datetime.now(dt.timezone.utc) - uploaded > dt.timedelta(hours=24):
                        raise ValueError("The recording expired before analysis finished. Upload a new clip.")
                    output = analyze_isolated(path, side)
                    with SessionLocal.begin() as db:
                        item = db.get(TrainingSession, session_id, with_for_update=True)
                        if item and item.status == "processing":
                            path.unlink(missing_ok=True)
                            item.analysis = output
                            item.metrics = output["summary"]
                            item.status = "ready"
                            item.error = None
                            item.source = {**item.source, "source_retained": False, "analysis_version": output["version"]}
                except Exception as exc:
                    logger.exception("Studio analysis failed for %s", session_id)
                    with SessionLocal.begin() as db:
                        item = db.get(TrainingSession, session_id, with_for_update=True)
                        if item and item.status == "processing":
                            path.unlink(missing_ok=True)
                            item.status = "failed"
                            item.error = str(exc) if isinstance(exc, ValueError) else ANALYSIS_FAILURE
                            item.source = {**item.source, "source_retained": False}
                return True
            finally:
                lock_connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})
    return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            expire_orphans()
            if not process_one():
                time.sleep(2)
        except KeyboardInterrupt:
            break
        except Exception:
            logger.exception("Worker could not poll the database")
            time.sleep(5)
