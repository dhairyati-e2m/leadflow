import os
import pytest

os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_TEST_URL"] = "sqlite+aiosqlite:///:memory:"
