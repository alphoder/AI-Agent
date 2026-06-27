"""ponytail: one-off generator — a short REAL Gemini-voice clip per voice.
Run once (servers/key not required to be up, just GEMINI_API_KEY in .env):
    ./.venv/bin/python scripts/gen_voice_samples.py
Writes apps/web/public/voices/<Voice>.wav. Re-run if the voice list changes.
Reuses the exact Gemini Live protocol the session relay uses (src/routes/session.py).
"""
import asyncio
import base64
import json
import pathlib
import sys
import wave

import websockets

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from src.config import settings  # noqa: E402

VOICES = ["Aoede", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Zephyr"]
TEXT = "Hi! I'm your SpeakCoach. Let's practice together — speak naturally, and I'll help you sound your best."
OUT = pathlib.Path(__file__).resolve().parents[3] / "apps/web/public/voices"
URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    f"?key={settings.gemini_api_key}"
)


async def one(voice: str) -> None:
    pcm = bytearray()
    async with websockets.connect(URL, max_size=None) as ws:
        await ws.send(json.dumps({"setup": {
            "model": settings.gemini_live_model,
            "generation_config": {
                "response_modalities": ["AUDIO"],
                "speech_config": {"voice_config": {"prebuilt_voice_config": {"voice_name": voice}}},
            },
        }}))
        async for raw in ws:
            if "setupComplete" in json.loads(raw):
                break
        await ws.send(json.dumps({"client_content": {
            "turns": [{"role": "user", "parts": [{"text": TEXT}]}], "turn_complete": True,
        }}))
        async for raw in ws:
            sc = json.loads(raw).get("serverContent")
            if not sc:
                continue
            for p in (sc.get("modelTurn") or {}).get("parts", []):
                inl = p.get("inlineData") or p.get("inline_data")
                if inl and inl.get("data"):
                    pcm += base64.b64decode(inl["data"])
            if sc.get("turnComplete"):
                break
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{voice}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)       # pcm16
        w.setframerate(24000)   # Gemini Live audio_out rate
        w.writeframes(bytes(pcm))
    assert len(pcm) > 8000, f"{voice}: suspiciously small clip ({len(pcm)} bytes)"
    print(f"{voice}: {len(pcm)} bytes -> {voice}.wav")


async def main() -> None:
    for v in VOICES:
        try:
            await one(v)
        except Exception as e:  # noqa: BLE001
            print(f"{v}: FAILED {e!r}")


if __name__ == "__main__":
    asyncio.run(main())
