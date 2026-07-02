import sqlite3
from typing import Optional, List
from app.infrastructure.database import get_db_connection

class UserRepository:
    @staticmethod
    def get_user_by_email(email: str) -> Optional[sqlite3.Row]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, nama_lengkap, email, password_hash, role FROM users WHERE email = ?",
            (email,)
        )
        row = cursor.fetchone()
        conn.close()
        return row

    @staticmethod
    def get_user_by_id(user_id: int) -> Optional[sqlite3.Row]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, nama_lengkap, email, password_hash, role FROM users WHERE id = ?",
            (user_id,)
        )
        row = cursor.fetchone()
        conn.close()
        return row

    @staticmethod
    def create_user(nama_lengkap: str, email: str, password_hash: str, role: str = "user") -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO users (nama_lengkap, email, password_hash, role) VALUES (?, ?, ?, ?)",
                (nama_lengkap, email, password_hash, role)
            )
            conn.commit()
            success = True
        except sqlite3.IntegrityError:
            conn.rollback()
            success = False
        finally:
            conn.close()
        return success

    @staticmethod
    def get_all_users() -> List[sqlite3.Row]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, nama_lengkap, email, role FROM users ORDER BY id ASC")
        rows = cursor.fetchall()
        conn.close()
        return rows

    @staticmethod
    def delete_user(user_id: int) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            conn.close()
            return False
        cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def update_user_role(user_id: int, role: str) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            conn.close()
            return False
        cursor.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def update_user_password(user_id: int, password_hash: str) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            conn.close()
            return False
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
        conn.commit()
        conn.close()
        return True
