import os
import shutil
from datetime import datetime
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from sqlalchemy.orm import Session
from pathlib import Path

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.models.template import Template
from app.schemas.template import TemplateOut

router = APIRouter()

ALLOWED_EXTENSIONS = {
    ".xlsx", ".xls",
    ".pdf",
    ".csv",
    ".doc", ".docx",
    ".ppt", ".pptx"
}

# Define the base directory for docs
# Using absolute path starting from backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DOCS_DIR = BASE_DIR / "@docs" / "template"

@router.get("/", response_model=List[TemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all uploaded templates from the database.
    """
    return db.query(Template).order_by(Template.created_at.desc()).all()

@router.post("/upload", response_model=TemplateOut)
async def upload_template(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a template file. Only allowed formats: Excel, PDF, CSV, Word, PPT.
    Stores the file in @docs/template/YYYY-MM-DD/ and records it in the database.
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types are: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Get current date
    date_str = datetime.now().strftime("%Y-%m-%d")
    
    # Create target directory if it doesn't exist
    target_dir = DOCS_DIR / date_str
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Construct final file path
    file_path = target_dir / file.filename
    
    # Save file
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )
    finally:
        file.file.close()

    # Save to database
    db_template = Template(
        filename=file.filename,
        path=f"@docs/template/{date_str}/{file.filename}",
        size=file_path.stat().st_size
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)

    return db_template
