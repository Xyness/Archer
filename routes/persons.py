import os
import uuid
from fastapi import APIRouter, Form, UploadFile, File, HTTPException, Query

from database import (
    insert_person, insert_photo, get_person_photos,
    delete_photo, search_persons, delete_person,
)
from face_engine import encode_photo, reload_encodings

router = APIRouter()

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")


def _save_upload(contents: bytes, original_filename: str) -> str:
    ext = os.path.splitext(original_filename)[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOADS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(contents)
    return filename


@router.post("/persons")
async def create_person(
    name: str = Form(...),
    surname: str = Form(...),
    date_of_birth: str = Form(...),
    photo: UploadFile = File(...),
):
    contents = await photo.read()
    encoding = encode_photo(contents)
    if encoding is None:
        raise HTTPException(status_code=400, detail="No face detected in the photo.")

    filename = _save_upload(contents, photo.filename)
    person_id = insert_person(name, surname, date_of_birth)
    insert_photo(person_id, f"uploads/{filename}", encoding)
    reload_encodings()

    return {"id": person_id, "message": "Person registered successfully."}


@router.get("/persons")
async def list_persons(
    q: str = Query("", alias="q"),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
):
    return search_persons(q.strip(), page, per_page)


@router.get("/persons/{person_id}/photos")
async def list_person_photos(person_id: int):
    photos = get_person_photos(person_id)
    return {"photos": photos}


@router.post("/persons/{person_id}/photos")
async def add_person_photo(person_id: int, photo: UploadFile = File(...)):
    contents = await photo.read()
    encoding = encode_photo(contents)
    if encoding is None:
        raise HTTPException(status_code=400, detail="No face detected in the photo.")

    filename = _save_upload(contents, photo.filename)
    photo_id = insert_photo(person_id, f"uploads/{filename}", encoding)
    reload_encodings()

    return {"photo_id": photo_id, "message": "Photo added successfully."}


@router.delete("/persons/{person_id}/photos/{photo_id}")
async def remove_person_photo(person_id: int, photo_id: int):
    photo_path = delete_photo(photo_id)
    if photo_path is None:
        raise HTTPException(status_code=404, detail="Photo not found.")

    full_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), photo_path)
    if os.path.exists(full_path):
        os.remove(full_path)

    reload_encodings()
    return {"message": "Photo deleted."}


@router.delete("/persons/{person_id}")
async def remove_person(person_id: int):
    photo_paths = delete_person(person_id)
    if photo_paths is None:
        raise HTTPException(status_code=404, detail="Person not found.")

    base_dir = os.path.dirname(os.path.dirname(__file__))
    for photo_path in photo_paths:
        full_path = os.path.join(base_dir, photo_path)
        if os.path.exists(full_path):
            os.remove(full_path)

    reload_encodings()
    return {"message": "Person deleted."}
