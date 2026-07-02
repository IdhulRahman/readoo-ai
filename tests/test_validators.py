"""Tests for Pydantic validators."""
import pytest
from app.core.validators import (
    RegisterRequest,
    LoginRequest,
    ChatRequest,
    TTSRequest,
)


class TestValidators:
    def test_register_valid(self):
        data = RegisterRequest(
            nama_lengkap="Test User",
            email="test@example.com",
            password="Test1234!@#"
        )
        assert data.nama_lengkap == "Test User"
        assert data.email == "test@example.com"

    def test_register_missing_fields(self):
        with pytest.raises(Exception):
            RegisterRequest()

    def test_register_weak_password_no_capital(self):
        with pytest.raises(Exception, match="huruf kapital"):
            RegisterRequest(
                nama_lengkap="Test",
                email="test@example.com",
                password="test1234!@#"
            )

    def test_register_weak_password_no_number(self):
        with pytest.raises(Exception, match="angka"):
            RegisterRequest(
                nama_lengkap="Test",
                email="test@example.com",
                password="TestTest!@#"
            )

    def test_register_weak_password_no_symbol(self):
        with pytest.raises(Exception, match="simbol"):
            RegisterRequest(
                nama_lengkap="Test",
                email="test@example.com",
                password="Test1234Test"
            )

    def test_register_short_password(self):
        with pytest.raises(Exception):
            RegisterRequest(
                nama_lengkap="Test",
                email="test@example.com",
                password="Ab1!@"
            )

    def test_login_valid(self):
        data = LoginRequest(email="test@example.com", password="Test1234!@#")
        assert data.email == "test@example.com"

    def test_login_missing_fields(self):
        with pytest.raises(Exception):
            LoginRequest()

    def test_chat_request(self):
        data = ChatRequest(message="Halo")
        assert data.message == "Halo"

    def test_chat_request_empty(self):
        with pytest.raises(Exception):
            ChatRequest(message="")

    def test_tts_request(self):
        data = TTSRequest(text="Halo dunia")
        assert data.text == "Halo dunia"

    def test_tts_request_empty(self):
        with pytest.raises(Exception):
            TTSRequest(text="")