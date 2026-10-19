"""
Move accounts that still have a leaked default password onto the current DEFAULT_PASSWORD from .env.

Every account is checked (including ones created before must_change_password existed); only those whose
password really is one of the leaked defaults are changed -- anyone who picked their own password is never
touched. Updated accounts must change the password at next sign-in and are signed out everywhere.

Run from the backend/ directory:
    python scripts/rotate_default_password.py           # dry run: only lists the accounts
    python scripts/rotate_default_password.py --apply   # actually updates them
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.config import LEAKED_DEFAULT_PASSWORDS, settings
from app.core.database import SessionLocal
from app.core.security import hash_password, verify_password
from app.models import access, menu, process, role, workflow  # noqa: F401 -- register every model for the mappers
from app.models.user import User


def main(apply: bool) -> None:
    db = SessionLocal()
    try:
        users = db.query(User).all()
        exposed = [
            u for u in users
            if any(verify_password(pw, u.hashed_password) for pw in LEAKED_DEFAULT_PASSWORDS)
        ]

        print(f"{len(users)} account(s) checked, {len(exposed)} still on a leaked default password:")
        for u in exposed:
            print(f"  - {u.employee_id} ({u.employee_name or 'no name'}){'' if u.is_active else ' [inactive]'}")

        if not exposed:
            return
        if not apply:
            print("\nDry run, nothing changed. Re-run with --apply to move them to the new DEFAULT_PASSWORD.")
            return

        new_hash = hash_password(settings.DEFAULT_PASSWORD)
        for u in exposed:
            u.hashed_password = new_hash
            u.must_change_password = True
            u.token_version = (u.token_version or 0) + 1  # sign out any session opened with the old password
        db.commit()
        print(f"\n[+] Updated {len(exposed)} account(s). Give those users the new default password.")
    finally:
        db.close()


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
