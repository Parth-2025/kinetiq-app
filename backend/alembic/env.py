from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from db.models import Base
from studio import models as studio_models  # noqa: F401 — register additive domain tables
from studio import coaching_models  # noqa: F401
from studio import claim_models  # noqa: F401
from studio import practice_capture_models  # noqa: F401
from studio import sensor_models  # noqa: F401
from studio import deletion_models  # noqa: F401
from studio import practice_tracking_models  # noqa: F401
from studio import rig_models  # noqa: F401
from settings import settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", settings.database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url, target_metadata=target_metadata, literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.", poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
