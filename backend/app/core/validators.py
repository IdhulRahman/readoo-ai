"""Pydantic validators for request/response validation."""
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    nama_lengkap: str = Field(min_length=1, description="Nama lengkap pengguna")
    email: str = Field(min_length=1, description="Email pengguna")
    password: str = Field(min_length=8, description="Password minimal 8 karakter")

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password wajib mengandung huruf kapital")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password wajib mengandung angka")
        symbols = "~`!@#$%^&*()_-+={[}]|\\:;\"'<,>.?/"
        if not any(c in symbols for c in v):
            raise ValueError("Password wajib mengandung karakter simbol (!@#$...)")
        return v


class LoginRequest(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, description="Pesan pengguna")


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, description="Teks untuk diubah ke suara")


class TTSAdminTestRequest(BaseModel):
    text: str = Field(min_length=1)
    provider: str = Field(default="edge-tts")
    language: str = Field(default="id-ID")
    voice: str = Field(default="")


class LLMTestConnectionRequest(BaseModel):
    llm_provider: str = Field(min_length=1)
    llm_model: str = Field(min_length=1)
    llm_api_key: str = Field(default="")


class LLMDetectModelsRequest(BaseModel):
    llm_provider: str = Field(min_length=1)
    llm_api_key: str = Field(default="")


class DatasetImportRequest(BaseModel):
    name: str = Field(min_length=1)
    embedding_cols: list[str] = Field(min_length=1)
    display_cols: list[str] = Field(min_length=1)
    temp_file: str = Field(min_length=1)


class CollectionCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    embedding_cols: list[str] = Field(min_length=1)
    display_cols: list[str] = Field(min_length=1)


class SettingsUpdateRequest(BaseModel):
    settings: dict = Field(default_factory=dict)