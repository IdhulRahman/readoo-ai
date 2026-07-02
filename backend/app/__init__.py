from flask import Flask
from flask_cors import CORS

from app.core.logging import setup_logging
from app.infrastructure.database import init_db


def create_app():
    # Initialize logging
    setup_logging()

    # Initialize SQLite database
    init_db()

    # Create app instance
    app = Flask(__name__)
    CORS(app)

    # Register blueprint with /api prefix
    from app.api import api_bp
    app.register_blueprint(api_bp, url_prefix="/api")

    # Register error handlers
    @app.errorhandler(404)
    def not_found(e):
        return {"error": "Endpoint tidak ditemukan"}, 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return {"error": "Method tidak diizinkan"}, 405

    @app.errorhandler(500)
    def internal_error(e):
        return {"error": "Terjadi kesalahan internal server"}, 500

    return app