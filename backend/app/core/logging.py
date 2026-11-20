"""Structured logging with secret redaction."""

from __future__ import annotations

import logging
import re

_SECRET_PATTERNS = [
    re.compile(r"(api[_-]?key|token|secret|password)\s*[=:]\s*([^\s,;'\"]+)", re.IGNORECASE),
    re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+", re.IGNORECASE),
]


class SecretRedactionFilter(logging.Filter):
    """Redacts obvious secret values before log records are emitted."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        sanitized = message
        sanitized = _SECRET_PATTERNS[0].sub(r"\1=[REDACTED]", sanitized)
        sanitized = _SECRET_PATTERNS[1].sub(r"\1[REDACTED]", sanitized)
        if sanitized != message:
            record.msg = sanitized
            record.args = ()
        return True


def configure_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(SecretRedactionFilter())
        root_logger.addHandler(handler)
    root_logger.setLevel(level)
