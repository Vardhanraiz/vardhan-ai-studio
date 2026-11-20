"""SQLAlchemy 2.0 database engine, session factory, and SQLite pragmas.

Designed for SQLite locally while keeping full SQLAlchemy compatibility
for PostgreSQL in future deployments.
"""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Shared declarative base for all ORM entities."""


def create_db_engine(database_url: str) -> Engine:
    """Create a configured SQLAlchemy engine for SQLite or PostgreSQL."""
    is_sqlite = database_url.startswith("sqlite:")
    connect_args: dict[str, Any] = {"check_same_thread": False} if is_sqlite else {}
    engine = create_engine(
        database_url,
        connect_args=connect_args,
        pool_pre_ping=not is_sqlite,
        future=True,
    )

    if is_sqlite:
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.close()

    return engine


class DatabaseManager:
    """Holds engine and sessionmaker bound to an application instance."""

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self.engine = create_db_engine(database_url)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
            class_=Session,
        )

    @property
    def dialect_name(self) -> str:
        return self.engine.dialect.name

    def init_tables(self) -> None:
        # Import models to guarantee metadata registration before create_all.
        from app.models import entities  # noqa: F401

        Base.metadata.create_all(bind=self.engine)

    def check_connection(self) -> bool:
        with self.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True

    def get_session(self) -> Generator[Session, None, None]:
        db = self.session_factory()
        try:
            yield db
        finally:
            db.close()

    def dispose(self) -> None:
        self.engine.dispose()
