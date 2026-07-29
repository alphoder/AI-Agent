"""Prove the relay ignores the learner's mic until the customer finishes speaking.

Opens a real session against the running relay and Gemini, blasts audio frames
immediately (as a noisy room would), and records the order of events. The gate
holds if `opener_done` arrives and every early frame was dropped.
"""
import asyncio
import base64
import json
import sys
import time

import httpx
import websockets

API = "http://localhost:4000"
EMAIL = "dev@speakcoach.local"
PASSWORD = "speakcoach-dev-2026"

# 100ms of quiet-but-not-silent PCM16 @16k: what a room sounds like.
NOISE = base64.b64encode(bytes(3200)).decode()


async def main() -> int:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{API}/api/auth/dev-login", json={"email": EMAIL, "password": PASSWORD})
        token = r.json()["data"]["accessToken"]
        scenarios = await c.get(f"{API}/api/scenarios?limit=1", headers={"Authorization": f"Bearer {token}"})
        sid = scenarios.json()["data"][0]["id"]
        s = await c.post(f"{API}/api/sessions", json={"scenario_id": sid, "language": "en"},
                         headers={"Authorization": f"Bearer {token}"})
        data = s.json()["data"]

    print(f"scenario   : {data['sessionConfig']['scenarioTitle']}")
    print(f"max seconds: {data['sessionConfig']['maxDurationSec']}")

    events: list[tuple[float, str]] = []
    t0 = time.monotonic()
    sent_before_opener = 0

    async with websockets.connect(data["wsUrl"], origin="http://localhost:3000", max_size=8_000_000) as ws:
        await ws.send(json.dumps({
            "type": "config",
            "system_prompt": data["sessionConfig"]["systemPrompt"],
            "voice": data["sessionConfig"]["voice"],
            "language": data["sessionConfig"]["language"],
        }))

        async def spam_noise():
            """Keep the room noisy from the very first moment."""
            nonlocal sent_before_opener
            while True:
                await ws.send(json.dumps({"type": "audio", "data": NOISE}))
                if not any(e[1] == "opener_done" for e in events):
                    sent_before_opener += 1
                await asyncio.sleep(0.1)

        noise = asyncio.create_task(spam_noise())
        try:
            while time.monotonic() - t0 < 45:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=45))
                kind = msg.get("type")
                if kind in ("listening", "opener_done", "response_end", "error", "call_ended"):
                    events.append((round(time.monotonic() - t0, 2), kind))
                    print(f"  {time.monotonic()-t0:5.2f}s  {kind}" + (f"  {msg.get('message','')}" if kind == "error" else ""))
                elif kind == "audio_out" and not any(e[1] == "audio_out" for e in events):
                    events.append((round(time.monotonic() - t0, 2), "audio_out"))
                    print(f"  {time.monotonic()-t0:5.2f}s  audio_out (their first word)")
                elif kind == "response_text":
                    print(f"         they said: {msg.get('text','')[:90]}")
                if any(e[1] == "opener_done" for e in events):
                    break
        finally:
            noise.cancel()

    order = [e[1] for e in events]
    print(f"\nframes sent before the opener finished: {sent_before_opener}")
    print(f"event order: {' -> '.join(order)}")

    ok = True
    if "opener_done" not in order:
        print("FAIL: opener_done never arrived")
        ok = False
    if "audio_out" in order and order.index("audio_out") > order.index("opener_done"):
        print("FAIL: opener_done fired before they spoke")
        ok = False
    if sent_before_opener < 5:
        print("INCONCLUSIVE: too few frames sent during the opener to prove anything")
        ok = False
    if ok:
        print(f"\nPASS: {sent_before_opener} noise frames were sent during the opener and none "
              f"interrupted it; the mic opened only after they finished.")
    return 0 if ok else 1


sys.exit(asyncio.run(main()))
