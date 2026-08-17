# Archer

Real-time face recognition in the browser. The webcam stays in the page, frames get posted
to a FastAPI backend that runs InsightFace (SCRFD to detect, ArcFace to embed), and the
response comes back as box coordinates plus whoever matched.

## Running it

You need Python 3.10+ and a webcam if you want the live page to do anything useful.

```bash
git clone https://github.com/Xyness/Archer.git
cd Archer
pip install -r requirements.txt
python main.py
```

Then open http://127.0.0.1:8000/static/index.html.

First launch downloads the `buffalo_l` model pack (~280 MB) into `~/.insightface/models/`,
so give it a minute before anything happens.

On Windows, install the [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
first or the InsightFace wheel won't build.

## How it works

The browser captures frames from the video element, encodes them as JPEG and POSTs them to
`/analyze-frame`. The backend decodes the frame, shrinks it to a quarter size, and runs
detection plus recognition on the small copy, then scales the coordinates back up before
they go out. Every embedding is compared against all stored encodings with cosine similarity.
People can have more than one photo, and the best match across their photos is the one
that counts.

Boxes come back as fractions of the frame rather than pixels, so the canvas overlay doesn't
have to know how big the video element ended up being. Known faces are drawn cyan, unknown
ones red.

## The two pages

`/static/index.html` is the live view. Allow the camera and matched people show up in the
sidebar with their similarity score.

`/static/persons.html` is the registry: register someone with a photo, search, paginate,
open a profile to add more photos or drop them. Registering several photos per person under
different lighting makes a real difference to the match rate. One photo is usually enough
to be recognised head-on and not much else.

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/persons` | Register a person (multipart form) |
| `GET` | `/persons` | List persons, takes `q`, `page`, `per_page` |
| `DELETE` | `/persons/{id}` | Delete a person and their photos |
| `GET` | `/persons/{id}/photos` | Photos belonging to a person |
| `POST` | `/persons/{id}/photos` | Add a photo |
| `DELETE` | `/persons/{id}/photos/{photo_id}` | Delete one photo |
| `POST` | `/analyze-frame` | Analyse a JPEG frame |

## Storage

SQLite, two tables. Embeddings are stored as raw float32 blobs and read back with
`np.frombuffer`, which keeps the schema simple at the cost of not being able to query
on them.

```sql
CREATE TABLE persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    photo_path TEXT NOT NULL,
    encoding BLOB NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
```

## Tuning

Both knobs live at the top of `face_engine.py`.

`SIMILARITY_THRESHOLD` is 0.4. ArcFace embeddings are normalised, so this is a plain cosine
score. Below roughly 0.3 you start collecting false matches, above 0.5 it gets picky about
angle and lighting. 0.4 was where it stopped mixing people up on my test set.

`SCALE_FACTOR` is 0.25. Detection runs on the downscaled frame, so this is the main lever on
latency. Raising it helps with faces further from the camera and costs frame rate.

Detection input is fixed at 320x320 and inference runs on CPU through ONNX Runtime. Swapping
in `CUDAExecutionProvider` in `_get_app()` works if you have the GPU build installed.

## Known limits

Matching is a linear scan over every stored encoding, which is fine for a few hundred people
and won't be beyond that; a proper vector index is the obvious next step. Encodings are
loaded into memory once at startup and refreshed on write, so an external process editing the
database won't be picked up. There's no auth on any of the endpoints.

## License

MIT
