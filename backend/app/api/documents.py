import shutil
from datetime import datetime
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from sqlalchemy.orm import Session
from pathlib import Path

from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.models.document import Document
from app.schemas.document import DocumentOut

router = APIRouter()

ALLOWED_EXTENSIONS = {
    ".xlsx", ".xls",
    ".pdf",
    ".csv",
    ".doc", ".docx",
    ".ppt", ".pptx"
}

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DOCS_DIR = BASE_DIR / "@docs" / "document"


@router.get("/", response_model=List[DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all uploaded documents from the database."""
    return db.query(Document).order_by(Document.created_at.desc()).all()


@router.post("/upload", response_model=DocumentOut)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a document file. Only allowed formats: Excel, PDF, CSV, Word, PPT.
    Stores the file in @docs/document/YYYY-MM-DD/ and records it in the database.
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types are: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    date_str = datetime.now().strftime("%Y-%m-%d")
    target_dir = DOCS_DIR / date_str
    target_dir.mkdir(parents=True, exist_ok=True)

    file_path = target_dir / file.filename

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

    db_document = Document(
        filename=file.filename,
        path=f"@docs/document/{date_str}/{file.filename}",
        size=file_path.stat().st_size
    )
    db.add(db_document)
    db.commit()
    db.refresh(db_document)

    return db_document
