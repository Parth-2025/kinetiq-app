"""Authenticated canonical motion retrieval for supported Studio records."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth.dependency import current_user
from db.models import User
from db.session import get_db
from studio import access
from studio.motion_contract import SCHEMA_VERSION, adapt_analysis

router = APIRouter(prefix="/studio", tags=["Performance Studio"])


@router.get("/sessions/{session_id}/motion")
def get_motion(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = access.session(db, user, session_id)
    if item.status != "ready":
        raise HTTPException(status_code=409, detail="Motion is available when analysis is ready.")
    motion = adapt_analysis(item.id, item.athlete_id, item.source or {}, item.analysis or {}, item.measurement_id)
    if motion is None:
        return {"status": "unsupported", "schema_version": SCHEMA_VERSION,
                "session_id": str(item.id), "reason": "legacy_or_unrecognized_motion_record",
                "capabilities": {"canonical_joint_positions": False, "joint_visibility": False,
                    "joint_angles": False, "mesh_reconstruction": False, "root_trajectory": False,
                    "world_displacement": False, "body_parameters": False, "refit_from_rgb": False}}
    return {"status": "available", **motion.model_dump(mode="json")}
