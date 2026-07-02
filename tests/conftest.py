"""Pytest configuration and fixtures."""
import os
import sys
import pytest

# Add backend to Python path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))


@pytest.fixture(autouse=True)
def setup_test_env():
    """Set up test environment variables."""
    os.environ["ENCRYPTION_KEY"] = "TrGBorFNd00aBjsMIfu6IK31Kyfi8blz9Q_HHaHivu8="
    os.environ["LLM_PROVIDER"] = "groq"
    os.environ["TTS_PROVIDER"] = "edge-tts"
    yield


@pytest.fixture
def app():
    """Create Flask test app."""
    from app import create_app
    app = create_app()
    app.config["TESTING"] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()