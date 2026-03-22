import os
import time

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _get_api():
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api.proxies import WebshareProxyConfig

    username = os.environ.get("WEBSHARE_PROXY_USERNAME", "")
    password = os.environ.get("WEBSHARE_PROXY_PASSWORD", "")

    if username and password:
        return YouTubeTranscriptApi(
            proxy_config=WebshareProxyConfig(
                proxy_username=username,
                proxy_password=password,
            )
        )
    return YouTubeTranscriptApi()


@app.get("/api/transcript")
def get_transcript(v: str = Query(..., description="YouTube video ID")):
    max_retries = 3
    last_error = None
    for attempt in range(max_retries):
        try:
            ytt_api = _get_api()
            transcript = ytt_api.fetch(v)
            text = " ".join(segment.text for segment in transcript)
            return {"ok": True, "transcript": text}
        except Exception as e:
            last_error = e
            if "429" in str(e) and attempt < max_retries - 1:
                time.sleep(2 ** attempt)
                continue
            break
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": str(last_error), "error_type": type(last_error).__name__},
    )


@app.get("/api/debug")
def debug_proxy():
    username = os.environ.get("WEBSHARE_PROXY_USERNAME", "")
    password = os.environ.get("WEBSHARE_PROXY_PASSWORD", "")
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api.proxies import WebshareProxyConfig
        yt_import = True
        import_error = None
    except Exception as e:
        yt_import = False
        import_error = str(e)

    return {
        "proxy_username_set": bool(username),
        "proxy_username_preview": username[:3] + "***" if len(username) > 3 else "NOT_SET",
        "proxy_password_set": bool(password),
        "youtube_transcript_api_importable": yt_import,
        "import_error": import_error,
    }
