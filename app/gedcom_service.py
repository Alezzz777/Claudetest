import re
from io import StringIO
from typing import Dict, List, Tuple, Optional
from sqlalchemy.orm import Session
from app.models import Person, Family, FamilyChild, GenderEnum
from datetime import datetime


def parse_gedcom(content: str, db: Session) -> Tuple[int, int]:
    """Parse GEDCOM file content and import into database. Returns (persons_count, families_count)."""
    lines = content.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    persons_map: Dict[str, dict] = {}
    families_map: Dict[str, dict] = {}
    current_record = None
    current_id = None
    current_sub = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        parts = line.split(" ", 2)
        level = int(parts[0]) if parts[0].isdigit() else 0
        tag = parts[1] if len(parts) > 1 else ""
        value = parts[2] if len(parts) > 2 else ""

        if level == 0:
            current_sub = None
            if tag.startswith("@") and tag.endswith("@"):
                xref = tag
                record_type = value
                if record_type == "INDI":
                    current_record = "INDI"
                    current_id = xref
                    persons_map[xref] = {
                        "first_name": "",
                        "last_name": "",
                        "maiden_name": "",
                        "gender": "U",
                        "birth_date": "",
                        "birth_place": "",
                        "death_date": "",
                        "death_place": "",
                        "notes": "",
                        "gedcom_id": xref,
                    }
                elif record_type == "FAM":
                    current_record = "FAM"
                    current_id = xref
                    families_map[xref] = {
                        "husband_ref": None,
                        "wife_ref": None,
                        "children_refs": [],
                        "marriage_date": "",
                        "marriage_place": "",
                        "divorce_date": "",
                        "gedcom_id": xref,
                    }
                else:
                    current_record = None
                    current_id = None
            else:
                current_record = None
                current_id = None
            continue

        if current_record == "INDI" and current_id:
            person = persons_map[current_id]
            if level == 1:
                current_sub = tag
                if tag == "NAME":
                    name_parts = value.split("/")
                    person["first_name"] = name_parts[0].strip()
                    if len(name_parts) > 1:
                        person["last_name"] = name_parts[1].strip()
                elif tag == "SEX":
                    person["gender"] = value if value in ("M", "F") else "U"
                elif tag == "NOTE":
                    person["notes"] = value
            elif level == 2:
                if current_sub == "BIRT":
                    if tag == "DATE":
                        person["birth_date"] = value
                    elif tag == "PLAC":
                        person["birth_place"] = value
                elif current_sub == "DEAT":
                    if tag == "DATE":
                        person["death_date"] = value
                    elif tag == "PLAC":
                        person["death_place"] = value
                elif current_sub == "NAME":
                    if tag == "GIVN":
                        person["first_name"] = value
                    elif tag == "SURN":
                        person["last_name"] = value
                    elif tag == "_MARNM":
                        person["maiden_name"] = value

        elif current_record == "FAM" and current_id:
            family = families_map[current_id]
            if level == 1:
                current_sub = tag
                if tag == "HUSB":
                    family["husband_ref"] = value
                elif tag == "WIFE":
                    family["wife_ref"] = value
                elif tag == "CHIL":
                    family["children_refs"].append(value)
            elif level == 2:
                if current_sub == "MARR":
                    if tag == "DATE":
                        family["marriage_date"] = value
                    elif tag == "PLAC":
                        family["marriage_place"] = value
                elif current_sub == "DIV":
                    if tag == "DATE":
                        family["divorce_date"] = value

    gedcom_to_db: Dict[str, int] = {}

    for xref, data in persons_map.items():
        gender_val = GenderEnum.male if data["gender"] == "M" else (
            GenderEnum.female if data["gender"] == "F" else GenderEnum.unknown
        )
        person = Person(
            first_name=data["first_name"] or "Unknown",
            last_name=data["last_name"],
            maiden_name=data["maiden_name"],
            gender=gender_val,
            birth_date=data["birth_date"],
            birth_place=data["birth_place"],
            death_date=data["death_date"],
            death_place=data["death_place"],
            notes=data["notes"],
            gedcom_id=data["gedcom_id"],
        )
        db.add(person)
        db.flush()
        gedcom_to_db[xref] = person.id

    for xref, data in families_map.items():
        husband_id = gedcom_to_db.get(data["husband_ref"]) if data["husband_ref"] else None
        wife_id = gedcom_to_db.get(data["wife_ref"]) if data["wife_ref"] else None

        family = Family(
            husband_id=husband_id,
            wife_id=wife_id,
            marriage_date=data["marriage_date"],
            marriage_place=data["marriage_place"],
            divorce_date=data["divorce_date"],
            gedcom_id=data["gedcom_id"],
        )
        db.add(family)
        db.flush()

        for child_ref in data["children_refs"]:
            child_db_id = gedcom_to_db.get(child_ref)
            if child_db_id:
                fc = FamilyChild(family_id=family.id, child_id=child_db_id)
                db.add(fc)

    db.commit()
    return len(persons_map), len(families_map)


def export_gedcom(db: Session) -> str:
    """Export all data to GEDCOM format."""
    lines = []
    lines.append("0 HEAD")
    lines.append("1 SOUR FamilyTreeApp")
    lines.append("2 VERS 1.0")
    lines.append("1 CHAR UTF-8")
    lines.append("1 GEDC")
    lines.append("2 VERS 5.5.1")
    lines.append("2 FORM LINEAGE-LINKED")

    persons = db.query(Person).all()
    families = db.query(Family).all()

    db_to_gedcom: Dict[int, str] = {}

    for person in persons:
        xref = person.gedcom_id if person.gedcom_id else f"@I{person.id}@"
        db_to_gedcom[person.id] = xref

        name_surname = f"/{person.last_name}/" if person.last_name else ""
        full_name = f"{person.first_name} {name_surname}".strip()

        lines.append(f"0 {xref} INDI")
        lines.append(f"1 NAME {full_name}")
        if person.first_name:
            lines.append(f"2 GIVN {person.first_name}")
        if person.last_name:
            lines.append(f"2 SURN {person.last_name}")
        if person.maiden_name:
            lines.append(f"2 _MARNM {person.maiden_name}")

        gender_char = person.gender.value if person.gender else "U"
        lines.append(f"1 SEX {gender_char}")

        if person.birth_date or person.birth_place:
            lines.append("1 BIRT")
            if person.birth_date:
                lines.append(f"2 DATE {person.birth_date}")
            if person.birth_place:
                lines.append(f"2 PLAC {person.birth_place}")

        if person.death_date or person.death_place:
            lines.append("1 DEAT")
            if person.death_date:
                lines.append(f"2 DATE {person.death_date}")
            if person.death_place:
                lines.append(f"2 PLAC {person.death_place}")

        if person.notes:
            lines.append(f"1 NOTE {person.notes}")

    for family in families:
        xref = family.gedcom_id if family.gedcom_id else f"@F{family.id}@"

        lines.append(f"0 {xref} FAM")
        if family.husband_id and family.husband_id in db_to_gedcom:
            lines.append(f"1 HUSB {db_to_gedcom[family.husband_id]}")
        if family.wife_id and family.wife_id in db_to_gedcom:
            lines.append(f"1 WIFE {db_to_gedcom[family.wife_id]}")

        if family.marriage_date or family.marriage_place:
            lines.append("1 MARR")
            if family.marriage_date:
                lines.append(f"2 DATE {family.marriage_date}")
            if family.marriage_place:
                lines.append(f"2 PLAC {family.marriage_place}")

        if family.divorce_date:
            lines.append("1 DIV")
            lines.append(f"2 DATE {family.divorce_date}")

        children = db.query(FamilyChild).filter(FamilyChild.family_id == family.id).all()
        for fc in children:
            if fc.child_id in db_to_gedcom:
                lines.append(f"1 CHIL {db_to_gedcom[fc.child_id]}")

    lines.append("0 TRLR")
    return "\n".join(lines)
