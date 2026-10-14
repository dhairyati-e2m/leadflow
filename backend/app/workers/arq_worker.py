"""
Re-export WorkerSettings for CLI compatibility.
"""
from backend.app.workers.worker import WorkerSettings, startup, shutdown

__all__ = ["WorkerSettings", "startup", "shutdown"]
