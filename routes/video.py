from fastapi import APIRouter, UploadFile, File

from face_engine import analyze_frame

router = APIRouter()


@router.post("/analyze-frame")
async def analyze(frame: UploadFile = File(...)):
    data = await frame.read()
    result = analyze_frame(data)
    return result
