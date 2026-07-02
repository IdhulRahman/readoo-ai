"""Tests for authentication endpoints."""
import json


import uuid


class TestAuth:
    def _unique_email(self):
        return f"test_{uuid.uuid4().hex[:8]}@example.com"

    def test_register_success(self, client):
        response = client.post(
            "/api/auth/register",
            json={
                "nama_lengkap": "Test User",
                "email": self._unique_email(),
                "password": "Test1234!@#"
            }
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["success"] is True

    def test_register_weak_password(self, client):
        response = client.post(
            "/api/auth/register",
            json={
                "nama_lengkap": "Test User",
                "email": self._unique_email(),
                "password": "weak"
            }
        )
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_register_duplicate_email(self, client):
        email = self._unique_email()
        # Register first
        client.post(
            "/api/auth/register",
            json={
                "nama_lengkap": "User 1",
                "email": email,
                "password": "Test1234!@#"
            }
        )
        # Try duplicate
        response = client.post(
            "/api/auth/register",
            json={
                "nama_lengkap": "User 2",
                "email": email,
                "password": "Test1234!@#"
            }
        )
        assert response.status_code == 400
        data = response.get_json()
        assert "sudah terdaftar" in data["error"]

    def test_login_success(self, client):
        email = self._unique_email()
        # Register first
        client.post(
            "/api/auth/register",
            json={
                "nama_lengkap": "Login Test",
                "email": email,
                "password": "Test1234!@#"
            }
        )
        # Login
        response = client.post(
            "/api/auth/login",
            json={
                "email": email,
                "password": "Test1234!@#"
            }
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "token" in data
        assert data["role"] == "user"

    def test_login_wrong_password(self, client):
        response = client.post(
            "/api/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "WrongPass123!"
            }
        )
        assert response.status_code == 401

    def test_login_empty_fields(self, client):
        response = client.post(
            "/api/auth/login",
            json={"email": "", "password": ""}
        )
        assert response.status_code == 400

    def test_logout(self, client):
        email = self._unique_email()
        # Register and login
        client.post(
            "/api/auth/register",
            json={
                "nama_lengkap": "Logout Test",
                "email": email,
                "password": "Test1234!@#"
            }
        )
        login_resp = client.post(
            "/api/auth/login",
            json={"email": email, "password": "Test1234!@#"}
        )
        token = login_resp.get_json()["token"]

        # Logout
        response = client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200

    def test_protected_endpoint_no_auth(self, client):
        response = client.post("/api/chat/text", json={"message": "halo"})
        assert response.status_code == 401

    def test_forgot_password(self, client):
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": "test@example.com"}
        )
        assert response.status_code == 200