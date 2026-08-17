import threading
import cv2
import numpy as np
from insightface.app import FaceAnalysis

from database import get_all_encodings

# Cosine similarity on normalised ArcFace embeddings. Below ~0.3 different people
# start matching each other, above ~0.5 it gets fussy about angle and lighting.
SIMILARITY_THRESHOLD = 0.4

# Detection runs on the downscaled frame, so this is the main lever on latency.
SCALE_FACTOR = 0.25

_app: FaceAnalysis | None = None
_known_persons: list[dict] = []
_lock = threading.Lock()


def _get_app() -> FaceAnalysis:
    global _app
    if _app is None:
        # buffalo_l also ships age/gender models we never use, and loading them
        # costs a few seconds of startup for nothing.
        _app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"], allowed_modules=["detection", "recognition"])
        _app.prepare(ctx_id=0, det_size=(320, 320))
    return _app


def encode_photo(image_bytes: bytes) -> np.ndarray | None:
    """Detect a single face in image bytes and return its 512-dim embedding."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    faces = _get_app().get(img)
    if not faces:
        return None
    return faces[0].normed_embedding.astype(np.float32)


def reload_encodings():
    """Pull every stored encoding into memory. Called at startup and after any write."""
    global _known_persons
    _get_app()
    with _lock:
        _known_persons = get_all_encodings()


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    # epsilon keeps a zero vector from blowing up the division
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


def analyze_frame(jpeg_bytes: bytes) -> dict:
    """Take a JPEG from the browser, return face boxes and whatever they matched."""
    arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"faces": [], "matches": []}

    h, w = frame.shape[:2]
    small = cv2.resize(frame, (0, 0), fx=SCALE_FACTOR, fy=SCALE_FACTOR)

    detected = _get_app().get(small)

    # Snapshot the list so a concurrent reload doesn't swap it mid-loop.
    with _lock:
        known_persons = list(_known_persons)

    faces = []
    matches = []
    inv_scale = 1 / SCALE_FACTOR  # boxes come out in downscaled space

    for face in detected:
        bbox = face.bbox
        left = float(bbox[0] * inv_scale)
        top = float(bbox[1] * inv_scale)
        right = float(bbox[2] * inv_scale)
        bottom = float(bbox[3] * inv_scale)
        enc = face.normed_embedding.astype(np.float32)

        label = "UNKNOWN"
        confidence = 0.0
        match_data = None

        if known_persons:
            best_sim = -1.0
            best_person = None
            for person in known_persons:
                # Best of a person's photos, not the average: one good angle should
                # be enough to identify them.
                sims = [_cosine_similarity(enc, pe) for pe in person["encodings"]]
                max_sim = max(sims)
                if max_sim > best_sim:
                    best_sim = max_sim
                    best_person = person

            if best_sim >= SIMILARITY_THRESHOLD and best_person is not None:
                label = f"{best_person['name']} {best_person['surname']}"
                confidence = best_sim
                match_data = {
                    "id": best_person["person_id"],
                    "name": best_person["name"],
                    "surname": best_person["surname"],
                    "date_of_birth": best_person["date_of_birth"],
                    "photo_path": best_person["photo_path"],
                    "similarity": float(best_sim),
                }
                matches.append(match_data)

        # Normalised to the frame so the canvas overlay doesn't need to know
        # what size the video element rendered at.
        faces.append({
            "x": float(left / w),
            "y": float(top / h),
            "w": float((right - left) / w),
            "h": float((bottom - top) / h),
            "label": label,
            "confidence": int(round(float(confidence) * 100)),
            "known": label != "UNKNOWN",
        })

    return {"faces": faces, "matches": matches}
