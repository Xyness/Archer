import sqlite3
import os
import numpy as np

DB_PATH = os.path.join(os.path.dirname(__file__), "archer.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Off by default in SQLite and it's per-connection, so the ON DELETE CASCADE
    # on photos only works if we set it every time.
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS persons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            surname TEXT NOT NULL,
            date_of_birth TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
            photo_path TEXT NOT NULL,
            encoding BLOB NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


def insert_person(name: str, surname: str, dob: str) -> int:
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO persons (name, surname, date_of_birth) VALUES (?, ?, ?)",
        (name, surname, dob),
    )
    conn.commit()
    person_id = cursor.lastrowid
    conn.close()
    return person_id


def insert_photo(person_id: int, photo_path: str, encoding: np.ndarray) -> int:
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO photos (person_id, photo_path, encoding) VALUES (?, ?, ?)",
        (person_id, photo_path, encoding.tobytes()),
    )
    conn.commit()
    photo_id = cursor.lastrowid
    conn.close()
    return photo_id


def get_person_photos(person_id: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, photo_path, created_at FROM photos WHERE person_id = ? ORDER BY created_at",
        (person_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_photo(photo_id: int) -> str | None:
    conn = get_connection()
    row = conn.execute("SELECT photo_path FROM photos WHERE id = ?", (photo_id,)).fetchone()
    if row is None:
        conn.close()
        return None
    photo_path = row["photo_path"]
    conn.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
    conn.commit()
    conn.close()
    return photo_path


def get_all_persons() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT p.id, p.name, p.surname, p.date_of_birth, p.created_at,
               (SELECT ph.photo_path FROM photos ph WHERE ph.person_id = p.id ORDER BY ph.created_at LIMIT 1) AS photo_path
        FROM persons p
        ORDER BY p.created_at DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def search_persons(query: str, page: int, per_page: int) -> dict:
    conn = get_connection()
    photo_sub = "(SELECT ph.photo_path FROM photos ph WHERE ph.person_id = p.id ORDER BY ph.created_at LIMIT 1)"
    base_select = f"SELECT p.id, p.name, p.surname, p.date_of_birth, p.created_at, {photo_sub} AS photo_path FROM persons p"

    if query:
        like = f"%{query}%"
        count = conn.execute(
            "SELECT COUNT(*) FROM persons WHERE name LIKE ? OR surname LIKE ?",
            (like, like),
        ).fetchone()[0]
        rows = conn.execute(
            f"{base_select} WHERE p.name LIKE ? OR p.surname LIKE ? ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
            (like, like, per_page, (page - 1) * per_page),
        ).fetchall()
    else:
        count = conn.execute("SELECT COUNT(*) FROM persons").fetchone()[0]
        rows = conn.execute(
            f"{base_select} ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
            (per_page, (page - 1) * per_page),
        ).fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": count}


def get_all_encodings() -> list[dict]:
    """Every photo joined to its person, collapsed into one row per person."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT p.id AS person_id, p.name, p.surname, p.date_of_birth,
               ph.photo_path, ph.encoding
        FROM photos ph
        JOIN persons p ON p.id = ph.person_id
    """).fetchall()
    conn.close()

    persons_map: dict[int, dict] = {}
    for r in rows:
        pid = r["person_id"]
        # Stored as raw float32 bytes, so read it straight back out.
        enc = np.frombuffer(r["encoding"], dtype=np.float32)
        if pid not in persons_map:
            persons_map[pid] = {
                "person_id": pid,
                "name": r["name"],
                "surname": r["surname"],
                "date_of_birth": r["date_of_birth"],
                "photo_path": r["photo_path"],
                "encodings": [],
            }
        persons_map[pid]["encodings"].append(enc)
    return list(persons_map.values())


def delete_person(person_id: int) -> list[str] | None:
    """Delete a person and return their photo paths for file cleanup. None if not found."""
    conn = get_connection()
    row = conn.execute("SELECT id FROM persons WHERE id = ?", (person_id,)).fetchone()
    if row is None:
        conn.close()
        return None
    photos = conn.execute("SELECT photo_path FROM photos WHERE person_id = ?", (person_id,)).fetchall()
    photo_paths = [p["photo_path"] for p in photos]
    conn.execute("DELETE FROM persons WHERE id = ?", (person_id,))
    conn.commit()
    conn.close()
    return photo_paths
