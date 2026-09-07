from sqlalchemy import text

from db.session import SessionLocal, get_db


def test_get_db_yields_and_commits(pg_engine):
    gen = get_db()
    db = next(gen)
    db.execute(text("SELECT 1"))
    # exhaust the generator -> commit + close, no error
    try:
        next(gen)
    except StopIteration:
        pass


def test_sessionlocal_bound_to_engine(pg_engine):
    with SessionLocal() as s:
        assert s.execute(text("SELECT 1")).scalar_one() == 1
