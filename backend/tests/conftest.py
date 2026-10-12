import os
import pytest

os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_TEST_URL"] = "postgresql+asyncpg://leadflow_app:leadflow_dev_password@127.0.0.1:5432/leadflow_test"
os.environ["REDIS_URL"] = "redis://127.0.0.1:6379/0"
