# Archer

Real-time face recognition system. Built with FastAPI, InsightFace (ArcFace), and vanilla JavaScript.

## Features

- **Real-time face detection** — Live webcam feed with face detection at high frame rates
- **Face recognition** — Identifies registered persons using ArcFace 512-dimensional embeddings with cosine similarity matching
- **HUD overlay** — HUD over detected faces (cyan for known, red for unknown)
- **Multi-photo support** — Register multiple photos per person for improved recognition accuracy
- **Person management** — Full CRUD: register, search, paginate, view profiles, and delete persons
- **Photo gallery** — Add or remove individual photos from a person's profile

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | [FastAPI](https://fastapi.tiangolo.com/) (Python) |
| Face Engine | [InsightFace](https://github.com/deepinsight/insightface) (ArcFace / SCRFD) |
| Inference | [ONNX Runtime](https://onnxruntime.ai/) (CPU) |
| Database | SQLite |
| Frontend | Vanilla JS + Canvas API |
| Styling | Custom CSS (glassmorphism / Apple-inspired) |

## Project Structure

```
Archer/
├── main.py              # FastAPI app entry point
├── database.py          # SQLite schema, migrations, CRUD
├── face_engine.py       # InsightFace: encoding, matching, frame analysis
├── requirements.txt     # Python dependencies
├── routes/
│   ├── persons.py       # REST API for persons & photos
│   └── video.py         # /analyze-frame endpoint
├── static/
│   ├── index.html       # Recognition page (webcam + HUD)
│   ├── persons.html     # Person management page
│   ├── app.js           # Frontend logic (camera, HUD, forms, gallery)
│   └── style.css        # UI styles
└── uploads/             # Stored person photos (auto-created)
```

## Prerequisites

- Python 3.10+
- A webcam (for real-time recognition)
- **Windows only**: [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (required to install InsightFace)

## Installation

```bash
# Clone the repository
git clone https://github.com/Xyness/Archer.git
cd Archer

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
```

The server starts at **http://127.0.0.1:8000**

On first launch, InsightFace will automatically download the `buffalo_l` model (~280MB) to `~/.insightface/models/`.

## Usage

### Recognition Page (`/static/index.html`)

1. Allow camera access when prompted
2. The HUD overlay will draw bounding boxes around detected faces
3. Registered persons show up in **cyan** with their name and confidence score
4. Unknown faces appear in **red**
5. The sidebar displays matched person details in real time

### Persons Page (`/static/persons.html`)

1. Fill in the registration form (name, surname, date of birth, photo)
2. Click **Register** — the photo is analyzed for face detection and stored
3. Browse registered persons in the searchable, paginated table
4. Click a row to open the profile modal
5. Add additional photos or delete existing ones from the profile

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/persons` | Register a new person (multipart form) |
| `GET` | `/persons` | List persons (query: `q`, `page`, `per_page`) |
| `DELETE` | `/persons/{id}` | Delete a person and all their photos |
| `GET` | `/persons/{id}/photos` | List photos for a person |
| `POST` | `/persons/{id}/photos` | Add a photo to a person |
| `DELETE` | `/persons/{id}/photos/{photo_id}` | Delete a specific photo |
| `POST` | `/analyze-frame` | Analyze a JPEG frame for face detection/recognition |

## Database Schema

```sql
-- Person identity
CREATE TABLE persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Multiple photos per person (1:N)
CREATE TABLE photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    photo_path TEXT NOT NULL,
    encoding BLOB NOT NULL,        -- 512-dim float32 ArcFace embedding
    created_at TEXT DEFAULT (datetime('now'))
);
```

## Configuration

Key constants in `face_engine.py`:

| Constant | Default | Description |
|---|---|---|
| `SIMILARITY_THRESHOLD` | `0.4` | Minimum cosine similarity to consider a match |
| `SCALE_FACTOR` | `0.25` | Frame downscale factor before detection (lower = faster) |

InsightFace model settings:

| Setting | Value | Description |
|---|---|---|
| Model | `buffalo_l` | ArcFace recognition + SCRFD detection |
| Detection size | `320x320` | Input resolution for face detection |
| Providers | `CPUExecutionProvider` | ONNX Runtime execution provider |

## How It Works

1. The browser captures webcam frames and sends them as JPEG to `/analyze-frame`
2. InsightFace detects faces (SCRFD) and extracts 512-dim embeddings (ArcFace)
3. Each embedding is compared against all stored encodings using cosine similarity
4. For multi-photo persons, the **maximum similarity** across all photos is used
5. Results are sent back to the browser, which draws the HUD overlay on a canvas

## License

MIT
