import os

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

proxy_username = os.environ.get("WEBSHARE_PROXY_USERNAME", "")
proxy_password = os.environ.get("WEBSHARE_PROXY_PASSWORD", "")

if proxy_username and proxy_password:
    ytt_api = YouTubeTranscriptApi(
        proxy_config=WebshareProxyConfig(
            proxy_username=proxy_username,
            proxy_password=proxy_password,
        )
    )
else:
    ytt_api = YouTubeTranscriptApi()


@app.get("/api/transcript")
def get_transcript(v: str = Query(..., description="YouTube video ID")):
    try:
        transcript = ytt_api.fetch(v)
        text = " ".join(segment.text for segment in transcript)
        return {"ok": True, "transcript": text}
    except Exception as e:
        return JSONResponse(
            status_code=404,
            content={"ok": False, "error": str(e), "error_type": type(e).__name__},
        )


@app.get("/api/debug")
def debug_proxy():
    return {
        "proxy_username_set": bool(proxy_username),
        "proxy_username_preview": proxy_username[:3] + "***" if len(proxy_username) > 3 else "NOT_SET",
        "proxy_password_set": bool(proxy_password),
    }
