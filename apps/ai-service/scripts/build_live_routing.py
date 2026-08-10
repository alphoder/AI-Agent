"""Regenerate src/core/live_routing.py by probing every language the app can emit.

    python scripts/build_live_routing.py

Run this after changing the native-audio model, or when Google's language support
moves. It probes each BCP-47 code against native audio and writes the table from
what the API actually answered — the point is that support is measured, never
assumed. A code that is wrongly listed as supported closes the socket with 1007
mid-call, which the learner experiences as the call simply dying.
"""
from __future__ import annotations

import asyncio
import json
import pathlib
import re
import sys

import websockets

sys.path.insert(0, ".")
from src.config import settings  # noqa: E402
from src.routes.session import _BCP47  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
ACCENT_EXTRAS = ["en-IN", "en-GB", "en-AU", "en-IE", "es-ES", "fr-CA", "pt-PT"]
SEM = asyncio.Semaphore(4)


def _key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        m = re.match(r"^GEMINI_API_KEY=(.*)$", line.strip())
        if m:
            return m.group(1).strip().strip('"').strip("'")
    sys.exit("no GEMINI_API_KEY")


async def _supported(url: str, code: str) -> tuple[str, bool]:
    """Setup-only probe: an unsupported language is refused at the handshake."""
    setup = {"setup": {
        "model": settings.gemini_native_audio_model,
        "generation_config": {
            "response_modalities": ["AUDIO"],
            "enable_affective_dialog": True,
            "speech_config": {"voice_config": {"prebuilt_voice_config": {"voice_name": "Kore"}},
                              "language_code": code},
        },
        "system_instruction": {"parts": [{"text": "hi"}]},
    }}
    async with SEM:
        try:
            async with websockets.connect(url, max_size=None, open_timeout=25) as ws:
                await ws.send(json.dumps(setup))
                await asyncio.wait_for(ws.recv(), timeout=20)
                return code, True
        except Exception:  # noqa: BLE001 — any refusal means "not supported"
            return code, False


async def main() -> None:
    url = ("wss://generativelanguage.googleapis.com/ws/"
           "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=") + _key()

    names = dict(re.findall(r"code:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'",
                            (ROOT / "packages/shared/src/languages.ts").read_text()))
    acc_src = (ROOT / "packages/shared/src/accents.ts").read_text()
    accent_label, accent_parent = {}, {}
    for block in re.finditer(r"(\w+):\s*\[(.*?)\]", acc_src, re.S):
        lang, body = block.group(1), block.group(2)
        if lang not in names:
            continue
        for code, label in re.findall(r"code:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'", body):
            accent_label[code], accent_parent[code] = label, lang

    codes = sorted(set(_BCP47.values()) | set(ACCENT_EXTRAS))
    supported = {c for c, ok in await asyncio.gather(*[_supported(url, c) for c in codes]) if ok}

    rows = [(b, names[l], accent_label.get(b), b in supported)
            for l, b in sorted(_BCP47.items()) if l in names]
    seen = {r[0] for r in rows}
    rows += [(c, names[accent_parent[c]], lab, c in supported)
             for c, lab in sorted(accent_label.items()) if c not in seen]
    rows.sort(key=lambda r: (r[1], r[0]))

    body = "\n".join(f"    LiveRoute({c!r}, {lang!r}, {a!r}, {n})" + "," for c, lang, a, n in rows)
    out = pathlib.Path("src/core/live_routing.py")
    src = out.read_text()
    src = re.sub(r"LIVE_ROUTES: tuple\[LiveRoute, \.\.\.\] = \(\n.*?\n\)",
                 f"LIVE_ROUTES: tuple[LiveRoute, ...] = (\n{body}\n)", src, flags=re.S)
    out.write_text(src)
    print(f"{len(rows)} codes — native audio: {len(supported)}, flash-live: {len(rows) - len(supported)}")


if __name__ == "__main__":
    asyncio.run(main())
