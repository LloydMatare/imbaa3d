# Imbaa3D AI Microservice (Phase 3 Stub)

This is a minimal FastAPI service stub for Phase 3. It is intended to become the
image/plan-to-geometry pipeline (wall detection, room segmentation, openings).

## Run (local)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## API

`POST /api/convert`

Accepts either:
- JSON: `{ "floorPlan": {...} }` (currently echoes a normalized placeholder response)
- Image: `{ "imageDataUrl": "data:image/png;base64,..." }` (stub returns ok with placeholder geometry)

## Integration Notes

Set `AI_SERVICE_URL="http://localhost:8001"` in the Next.js app to enable:
- `/api/ai/convert/:projectId` proxy calls
- image-mode queued conversions (worker calls the AI service)
