from pydantic import BaseModel

class CreatorOut(BaseModel):
    employee_id: str
    employee_name: str | None = None

    model_config = {"from_attributes": True}
