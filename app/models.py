from sqlalchemy import Column, Integer, String, Date, ForeignKey, Text, Enum as SAEnum, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


class GenderEnum(str, enum.Enum):
    male = "M"
    female = "F"
    unknown = "U"


class Person(Base):
    __tablename__ = "persons"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(200), nullable=False)
    last_name = Column(String(200), default="")
    maiden_name = Column(String(200), default="")
    gender = Column(SAEnum(GenderEnum), default=GenderEnum.unknown)
    birth_date = Column(String(50), default="")
    birth_place = Column(String(500), default="")
    death_date = Column(String(50), default="")
    death_place = Column(String(500), default="")
    notes = Column(Text, default="")
    photo_url = Column(String(1000), default="")
    gedcom_id = Column(String(50), default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    families_as_spouse = relationship(
        "Family",
        primaryjoin="or_(Person.id==Family.husband_id, Person.id==Family.wife_id)",
        viewonly=True,
    )
    families_as_child = relationship(
        "FamilyChild",
        back_populates="child",
        foreign_keys="FamilyChild.child_id",
    )


class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    husband_id = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    wife_id = Column(Integer, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    marriage_date = Column(String(50), default="")
    marriage_place = Column(String(500), default="")
    divorce_date = Column(String(50), default="")
    gedcom_id = Column(String(50), default="")
    created_at = Column(DateTime, server_default=func.now())

    husband = relationship("Person", foreign_keys=[husband_id])
    wife = relationship("Person", foreign_keys=[wife_id])
    children = relationship("FamilyChild", back_populates="family")


class FamilyChild(Base):
    __tablename__ = "family_children"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    child_id = Column(Integer, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False)

    family = relationship("Family", back_populates="children")
    child = relationship("Person", back_populates="families_as_child", foreign_keys=[child_id])
