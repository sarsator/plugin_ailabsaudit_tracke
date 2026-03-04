"""
ailabsaudit_tracker — AI Labs Audit Tracker Python Collector

Zero-dependency library for sending HMAC-SHA256 signed events
to the AI Labs Audit ingestion API.
"""

__version__ = "1.0.0"

from .tracker import AilabsTracker, sign, signature_header  # noqa: F401

__all__ = [
    "AilabsTracker",
    "sign",
    "signature_header",
]
