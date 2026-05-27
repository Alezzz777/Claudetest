from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.database import engine, get_db, Base
from app.models import Person, Family, FamilyChild, GenderEnum
from app.schemas import (
    PersonCreate, PersonUpdate, PersonOut,
    FamilyCreate, FamilyUpdate, FamilyOut,
)
from app.gedcom_service import parse_gedcom, export_gedcom

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Family Tree", version="1.0.0")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


# --- Person CRUD ---

@app.get("/api/persons", response_model=List[PersonOut])
def list_persons(search: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Person)
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            (Person.first_name.ilike(pattern)) |
            (Person.last_name.ilike(pattern)) |
            (Person.maiden_name.ilike(pattern))
        )
    return q.order_by(Person.last_name, Person.first_name).all()


@app.get("/api/persons/{person_id}", response_model=PersonOut)
def get_person(person_id: int, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@app.post("/api/persons", response_model=PersonOut)
def create_person(data: PersonCreate, db: Session = Depends(get_db)):
    gender_val = GenderEnum.male if data.gender == "M" else (
        GenderEnum.female if data.gender == "F" else GenderEnum.unknown
    )
    person = Person(
        first_name=data.first_name,
        last_name=data.last_name,
        maiden_name=data.maiden_name,
        gender=gender_val,
        birth_date=data.birth_date,
        birth_place=data.birth_place,
        death_date=data.death_date,
        death_place=data.death_place,
        notes=data.notes,
        photo_url=data.photo_url,
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@app.put("/api/persons/{person_id}", response_model=PersonOut)
def update_person(person_id: int, data: PersonUpdate, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    update_data = data.model_dump(exclude_unset=True)
    if "gender" in update_data:
        g = update_data["gender"]
        update_data["gender"] = GenderEnum.male if g == "M" else (
            GenderEnum.female if g == "F" else GenderEnum.unknown
        )
    for key, val in update_data.items():
        setattr(person, key, val)
    db.commit()
    db.refresh(person)
    return person


@app.delete("/api/persons/{person_id}")
def delete_person(person_id: int, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    db.query(FamilyChild).filter(FamilyChild.child_id == person_id).delete()
    db.query(Family).filter(
        (Family.husband_id == person_id) | (Family.wife_id == person_id)
    ).update(
        {Family.husband_id: None} if Family.husband_id == person_id else {Family.wife_id: None},
        synchronize_session=False,
    )
    for fam in db.query(Family).filter(
        (Family.husband_id == person_id) | (Family.wife_id == person_id)
    ).all():
        if fam.husband_id == person_id:
            fam.husband_id = None
        if fam.wife_id == person_id:
            fam.wife_id = None
    db.delete(person)
    db.commit()
    return {"ok": True}


# --- Family CRUD ---

@app.get("/api/families", response_model=List[FamilyOut])
def list_families(db: Session = Depends(get_db)):
    return (
        db.query(Family)
        .options(
            joinedload(Family.husband),
            joinedload(Family.wife),
            joinedload(Family.children).joinedload(FamilyChild.child),
        )
        .all()
    )


@app.get("/api/families/{family_id}", response_model=FamilyOut)
def get_family(family_id: int, db: Session = Depends(get_db)):
    family = (
        db.query(Family)
        .options(
            joinedload(Family.husband),
            joinedload(Family.wife),
            joinedload(Family.children).joinedload(FamilyChild.child),
        )
        .filter(Family.id == family_id)
        .first()
    )
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    return family


@app.post("/api/families", response_model=FamilyOut)
def create_family(data: FamilyCreate, db: Session = Depends(get_db)):
    family = Family(
        husband_id=data.husband_id,
        wife_id=data.wife_id,
        marriage_date=data.marriage_date,
        marriage_place=data.marriage_place,
        divorce_date=data.divorce_date,
    )
    db.add(family)
    db.flush()
    for cid in data.children_ids:
        fc = FamilyChild(family_id=family.id, child_id=cid)
        db.add(fc)
    db.commit()
    return get_family(family.id, db)


@app.put("/api/families/{family_id}", response_model=FamilyOut)
def update_family(family_id: int, data: FamilyUpdate, db: Session = Depends(get_db)):
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    update_data = data.model_dump(exclude_unset=True)
    children_ids = update_data.pop("children_ids", None)
    for key, val in update_data.items():
        setattr(family, key, val)
    if children_ids is not None:
        db.query(FamilyChild).filter(FamilyChild.family_id == family_id).delete()
        for cid in children_ids:
            fc = FamilyChild(family_id=family_id, child_id=cid)
            db.add(fc)
    db.commit()
    return get_family(family_id, db)


@app.delete("/api/families/{family_id}")
def delete_family(family_id: int, db: Session = Depends(get_db)):
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    db.query(FamilyChild).filter(FamilyChild.family_id == family_id).delete()
    db.delete(family)
    db.commit()
    return {"ok": True}


# --- Tree API ---

@app.get("/api/tree/{person_id}")
def get_tree(person_id: int, db: Session = Depends(get_db)):
    """Get full tree data centered on a person."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    visited = set()

    def build_node(pid: int, depth: int = 0) -> Optional[dict]:
        if pid in visited or depth > 10:
            return None
        visited.add(pid)
        p = db.query(Person).filter(Person.id == pid).first()
        if not p:
            return None

        node = {
            "id": p.id,
            "name": f"{p.first_name} {p.last_name}".strip(),
            "first_name": p.first_name,
            "last_name": p.last_name,
            "gender": p.gender.value if p.gender else "U",
            "birth_date": p.birth_date or "",
            "death_date": p.death_date or "",
            "spouses": [],
            "children": [],
            "parents": [],
        }

        parent_links = db.query(FamilyChild).filter(FamilyChild.child_id == pid).all()
        for pl in parent_links:
            fam = db.query(Family).filter(Family.id == pl.family_id).first()
            if fam:
                if fam.husband_id:
                    h = db.query(Person).filter(Person.id == fam.husband_id).first()
                    if h:
                        node["parents"].append({
                            "id": h.id,
                            "name": f"{h.first_name} {h.last_name}".strip(),
                            "gender": h.gender.value if h.gender else "U",
                        })
                if fam.wife_id:
                    w = db.query(Person).filter(Person.id == fam.wife_id).first()
                    if w:
                        node["parents"].append({
                            "id": w.id,
                            "name": f"{w.first_name} {w.last_name}".strip(),
                            "gender": w.gender.value if w.gender else "U",
                        })

        spouse_families = db.query(Family).filter(
            (Family.husband_id == pid) | (Family.wife_id == pid)
        ).all()

        for fam in spouse_families:
            spouse_id = fam.wife_id if fam.husband_id == pid else fam.husband_id
            if spouse_id:
                sp = db.query(Person).filter(Person.id == spouse_id).first()
                if sp:
                    node["spouses"].append({
                        "id": sp.id,
                        "name": f"{sp.first_name} {sp.last_name}".strip(),
                        "gender": sp.gender.value if sp.gender else "U",
                        "marriage_date": fam.marriage_date or "",
                        "family_id": fam.id,
                    })

            family_children = db.query(FamilyChild).filter(FamilyChild.family_id == fam.id).all()
            for fc in family_children:
                child_node = build_node(fc.child_id, depth + 1)
                if child_node:
                    node["children"].append(child_node)

        return node

    tree = build_node(person_id)
    return tree


# --- GEDCOM Import/Export ---

@app.post("/api/gedcom/import")
async def import_gedcom(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    persons_count, families_count = parse_gedcom(text, db)
    return {
        "message": f"Imported {persons_count} persons and {families_count} families",
        "persons": persons_count,
        "families": families_count,
    }


@app.get("/api/gedcom/export")
def export_gedcom_file(db: Session = Depends(get_db)):
    content = export_gedcom(db)
    return Response(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=family_tree.ged"},
    )


@app.delete("/api/clear")
def clear_all(db: Session = Depends(get_db)):
    db.query(FamilyChild).delete()
    db.query(Family).delete()
    db.query(Person).delete()
    db.commit()
    return {"ok": True}
