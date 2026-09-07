from collections.abc import Iterator

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.orm import Session, sessionmaker

from settings import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except (OperationalError, InterfaceError) as exc:
        db.rollback()
        raise HTTPException(503, "database unavailable") from exc
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
