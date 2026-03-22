from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from youtube_transcript_api import YouTubeTranscriptApi

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/transcript")
def get_transcript(v: str = Query(..., description="YouTube video ID")):
    try:
        transcript = YouTubeTranscriptApi().fetch(v)
        text = " ".join(segment.text for segment in transcript)
        return {"ok": True, "transcript": text}
    except Exception as e:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": str(e)},
        )
