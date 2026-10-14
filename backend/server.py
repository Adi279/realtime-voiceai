from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

from bot import run_bot

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
load_dotenv(BASE_DIR / ".env", override=True)

small_webrtc_handler = SmallWebRTCRequestHandler()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await small_webrtc_handler.close()


app = FastAPI(title="Realtime Voice AI", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/offer")
async def offer(request: SmallWebRTCRequest, background_tasks: BackgroundTasks):
    async def connection_callback(connection):
        background_tasks.add_task(run_bot, connection)

    return await small_webrtc_handler.handle_web_request(
        request=request,
        webrtc_connection_callback=connection_callback,
    )


@app.patch("/api/offer")
async def patch_offer(request: SmallWebRTCPatchRequest):
    await small_webrtc_handler.handle_patch_request(request)
    return {"status": "ok"}


if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/")
    async def index():
        return FileResponse(FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=7860, reload=True)
