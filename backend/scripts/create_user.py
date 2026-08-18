"""
Run from the backend/ directory:
    python scripts/create_user.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.models.role import Role


def create_user(
    employee_id: str,
    password: str,
    employee_name: str = None,
    location: str = None,
    is_superuser: bool = False,
):
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.employee_id == employee_id).first()
        if existing:
            print(f"[!] User '{employee_id}' already exists.")
            return

        user = User(
            employee_id=employee_id,
            hashed_password=hash_password(password),
            employee_name=employee_name,
            location=location,
            is_superuser=is_superuser,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"[+] User created  →  id={user.id}  employee_id={user.employee_id}")
    except ValueError as e:
        print(f"[!] Validation error: {e}")
    except Exception as e:
        db.rollback()
        print(f"[!] Error: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    print("=== Create User ===")
    employee_id  = input("Employee ID (e.g. MAH001 / MNW001 / email): ").strip()
    password     = input("Password: ").strip()
    employee_name = input("Full name (optional): ").strip() or None
    location     = input("Location  (optional): ").strip() or None
    superuser    = input("Superuser? [y/N]: ").strip().lower() == "y"

    create_user(
        employee_id=employee_id,
        password=password,
        employee_name=employee_name,
        location=location,
        is_superuser=superuser,
    )
