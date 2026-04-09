from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Imbaa3D AI Microservice", version="0.0.1")


class ConvertRequest(BaseModel):
    # Phase 3 intent:
    # - accept either structured 2D plan JSON (FloorPlanDoc) or an uploaded image
    floorPlan: Optional[Dict[str, Any]] = Field(default=None)
    imageDataUrl: Optional[str] = Field(default=None)


class ConvertResponse(BaseModel):
    # Placeholder response shape. The Next.js app can evolve to consume this.
    # Real implementation should include openings, rooms, heights, labels, etc.
    ok: bool
    geometry: Dict[str, Any]


@app.get("/healthz")
def healthz() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/convert", response_model=ConvertResponse)
def convert(req: ConvertRequest) -> ConvertResponse:
    if req.floorPlan is not None:
        # Stub: return a minimal "AI output" wrapper around the incoming plan.
        # This makes it easy to wire integration without depending on CV/ML yet.
        return ConvertResponse(
            ok=True,
            geometry={
                "source": "floorPlan",
                "floorPlan": req.floorPlan,
                "notes": "stub: no AI applied yet",
            },
        )

    if req.imageDataUrl is not None:
        # Phase 3: implement CV pipeline here (OpenCV + model inference).
        # Stub: return a placeholder response so integration can be tested.
        return ConvertResponse(
            ok=True,
            geometry={
                "source": "image",
                "notes": "stub: image processing not implemented yet",
            },
        )

    raise HTTPException(status_code=400, detail="Provide either floorPlan or imageDataUrl")
