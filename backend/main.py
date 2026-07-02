import logging
from waitress import serve

from app import create_app
from app.core.config import settings

logger = logging.getLogger("waitress")

# Create Flask application
app = create_app()

if __name__ == "__main__":
    logger.info("Starting Waitress production WSGI server on %s:%d", settings.HOST, settings.PORT)
    serve(app, host=settings.HOST, port=settings.PORT, threads=16)
