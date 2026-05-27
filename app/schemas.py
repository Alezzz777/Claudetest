from pydantic import BaseModel
from typing import Optional, List


class PersonBase(BaseModel):
    first_name: str
    last_name: str = ""
    maiden_name: str = ""
    gender: str = "U"
    birth_date: str = ""
    birth_place: str = ""
    death_date: str = ""
    death_place: str = ""
    notes: str = ""
    photo_url: str = ""


class PersonCreate(PersonBase):
    pass


class PersonUpdate(PersonBase):
    first_name: Optional[str] = None


class PersonOut(PersonBase):
    id: int

    class Config:
        from_attributes = True


class FamilyBase(BaseModel):
    husband_id: Optional[int] = None
    wife_id: Optional[int] = None
    marriage_date: str = ""
    marriage_place: str = ""
    divorce_date: str = ""


class FamilyCreate(FamilyBase):
    children_ids: List[int] = []


class FamilyUpdate(FamilyBase):
    children_ids: Optional[List[int]] = None


class FamilyChildOut(BaseModel):
    id: int
    child_id: int
    child: PersonOut

    class Config:
        from_attributes = True


class FamilyOut(FamilyBase):
    id: int
    husband: Optional[PersonOut] = None
    wife: Optional[PersonOut] = None
    children: List[FamilyChildOut] = []

    class Config:
        from_attributes = True


class TreeNode(BaseModel):
    person: PersonOut
    parents: Optional["TreeNode"] = None
    spouse: Optional[PersonOut] = None
    children: List["TreeNode"] = []
    family_id: Optional[int] = None
