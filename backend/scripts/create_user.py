"""
Create a user (and its role) from the command line.

Local:   run from the backend/ directory:  python scripts/create_user.py
Docker:  scripts\\windows\\docker.bat createuser   or   ./scripts/ubuntu/docker.sh createuser
         (same as: docker compose run --rm backend createuser)

Full access (Developer) needs BOTH is_superuser = True AND a role named "Developer"
(see has_full_access in app/core/dependencies.py). Answering "y" to superuser defaults the
role to "Developer", which is created if it doesn't exist yet.
"""

import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.models.role import Role


def get_or_create_role(db, role_name: str) -> Role:
    """Finds a role by name (case-insensitive) or creates it."""
    role = db.query(Role).filter(Role.name.ilike(role_name)).first()
    if role:
        if not role.is_active:
            role.is_active = True
            print(f"[+] Role '{role.name}' re-activated.")
        return role
    role = Role(name=role_name, is_active=True)
    db.add(role)
    db.flush()
    print(f"[+] Role created  →  id={role.id}  name={role.name}")
    return role


def create_user(
    employee_id: str,
    password: str,
    employee_name: str = None,
    location: str = None,
    is_superuser: bool = False,
    role_name: str = None,
):
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        role = get_or_create_role(db, role_name) if role_name else None

        existing = db.query(User).filter(User.employee_id == employee_id).first()
        if existing:
            print(f"[!] User '{employee_id}' already exists.")
            answer = input("    Update its role and superuser flag instead? [y/N]: ").strip().lower()
            if answer != "y":
                db.rollback()
                return
            existing.is_superuser = is_superuser
            if role:
                existing.role_id = role.id
            db.commit()
            print(f"[+] User updated  →  id={existing.id}  role={role.name if role else '-'}  superuser={is_superuser}")
            return

        user = User(
            employee_id=employee_id,
            hashed_password=hash_password(password),
            employee_name=employee_name,
            location=location,
            is_superuser=is_superuser,
            is_active=True,
            role_id=role.id if role else None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(
            f"[+] User created  →  id={user.id}  employee_id={user.employee_id}  "
            f"role={role.name if role else '-'}  superuser={is_superuser}"
        )
        if is_superuser and role and role.name.strip().lower() == "developer":
            print("[+] This user has full Developer access.")
    except ValueError as e:
        db.rollback()
        print(f"[!] Validation error: {e}")
    except Exception as e:
        db.rollback()
        print(f"[!] Error: {e}")
    finally:
        db.close()


def _ask_password() -> str:
    password = getpass.getpass("Password (hidden): ").strip()
    if not password:
        print("[!] Password is required.")
        sys.exit(1)
    if getpass.getpass("Confirm password: ").strip() != password:
        print("[!] Passwords do not match.")
        sys.exit(1)
    return password


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Create a user and its role. With no arguments, asks each question.",
        epilog=(
            "Examples:\n"
            "  python scripts/create_user.py MAH001 --superuser            (Developer, full access)\n"
            "  python scripts/create_user.py MAH002 --role Operator --name \"Ravi Kumar\"\n"
            "The password is always asked hidden unless CREATE_USER_PASSWORD is set in the environment."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("employee_id", nargs="?", help="MAH001 / MNW001 / email")
    parser.add_argument("--name", dest="employee_name", help="full name")
    parser.add_argument("--location", help="location")
    parser.add_argument("--superuser", action="store_true", help="make superuser (role defaults to Developer)")
    parser.add_argument("--role", dest="role_name", help='role name, e.g. Developer or Operator')
    args = parser.parse_args()

    print("=== Create User ===")
    if args.employee_id:
        # One-line mode: everything from arguments; the password stays out of the command line/history.
        employee_id = args.employee_id.strip()
        password = os.environ.get("CREATE_USER_PASSWORD", "").strip() or _ask_password()
        employee_name = args.employee_name
        location = args.location
        superuser = args.superuser
        role_name = args.role_name or ("Developer" if superuser else None)
    else:
        employee_id = input("Employee ID (e.g. MAH001 / MNW001 / email): ").strip()
        password = _ask_password()
        employee_name = input("Full name (optional): ").strip() or None
        location = input("Location  (optional): ").strip() or None
        superuser = input("Superuser? [y/N]: ").strip().lower() == "y"
        default_role = "Developer" if superuser else ""
        prompt = f"Role name [{default_role}]: " if default_role else "Role name (optional, e.g. Operator): "
        role_name = input(prompt).strip() or default_role or None

    create_user(
        employee_id=employee_id,
        password=password,
        employee_name=employee_name,
        location=location,
        is_superuser=superuser,
        role_name=role_name,
    )
