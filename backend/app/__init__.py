from flask import Flask
from flask_cors import CORS

from app.core.logging import setup_logging
from app.infrastructure.database import init_db
from app.api.routes import api_bp


def create_app():
    # Initialize logging
    setup_logging()

    # Initialize SQLite database
    init_db()

    # Create app instance
    app = Flask(__name__)
    CORS(app)

    # Register blueprint with /api prefix
    app.register_blueprint(api_bp, url_prefix="/api")

    return app
