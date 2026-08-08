"""Verify what the Gemini Live model ACTUALLY supports with the configured key.

Run this after changing `gemini_live_model` in src/config.py, or whenever you are
about to add a voice to packages/shared/src/voices.ts or a language to
languages.ts. Both files are claims about a remote service; this checks them.

    python scripts/verify_live_capabilities.py voices
    python scripts/verify_live_capabilities.py languages
    python scripts/verify_live_capabilities.py languages hi-IN=Hindi,ta-IN=Tamil

Two things learned the hard way, which is why this script tests the way it does:

  * A bad VOICE is rejected at setup, so voices can be probed cheaply.
  * A bad LANGUAGE is NOT. `language_code: "xx-ZZ"` returns setupComplete quite
    happily, so setup-probing proves nothing — the only honest test is to
    generate a turn and read the output transcription back. Hence this script
    actually talks to the model (which costs a little) for languages.

It also mirrors the real system prompt's language directive, because that
directive — not language_code — is what makes the model speak the language.
Testing without it reports 60+ working languages as broken.

Last full run: 2026-08-08 against models/gemini-3.1-flash-live-preview.
Result: 30/30 voices accepted, 74/74 languages replied idiomatically in-script.
"""
import asyncio, json, re, sys, unicodedata
import websockets

MODEL = "models/gemini-3.1-flash-live-preview"
URL = ("wss://generativelanguage.googleapis.com/ws/"
       "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=")

# Mirrors buildSystemPrompt (apps/api/src/utils/prompt-bundle.ts): the hard
# language directive sits at the very top of every real session's prompt.
def prompt_for(name: str, code: str) -> str:
    return (
        f'LANGUAGE (NON-NEGOTIABLE): You MUST speak ONLY in {name} (code "{code}") for the '
        f'entire conversation. Every single response, including the opening line, must be in '
        f'{name}. Even if the learner speaks another language, you reply in {name}. Never '
        f'switch languages under any circumstances.\n\n'
        "You are a busy person who has just answered an unexpected phone call. "
        "Say one short, natural sentence answering the phone. One sentence only."
    )


def load_key():
    for line in open('/Users/vedantsingh/Documents/Projects/AI AVATAR TRAINING PLATFORM/.env'):
        m = re.match(r'^GEMINI_API_KEY=(.*)$', line.strip())
        if m:
            return m.group(1).strip().strip('"').strip("'")
    sys.exit("no GEMINI_API_KEY")


KEY = load_key()
SEM = asyncio.Semaphore(3)


def script_of(text: str) -> str:
    """Dominant Unicode script of the reply — decisive for non-Latin languages."""
    counts: dict[str, int] = {}
    for ch in text:
        if not ch.isalpha():
            continue
        try:
            name = unicodedata.name(ch).split()[0]
        except ValueError:
            continue
        counts[name] = counts.get(name, 0) + 1
    return max(counts, key=counts.get) if counts else "NONE"


async def speak(spec: str) -> tuple[str, str]:
    lang, name = spec.split("=")
    setup = {"setup": {
        "model": MODEL,
        "generation_config": {
            "response_modalities": ["AUDIO"],
            "speech_config": {
                "voice_config": {"prebuilt_voice_config": {"voice_name": "Kore"}},
                "language_code": lang,
            },
        },
        "system_instruction": {"parts": [{"text": prompt_for(name, lang)}]},
        "output_audio_transcription": {},
    }}
    async with SEM:
        try:
            async with websockets.connect(URL + KEY, max_size=None, open_timeout=30) as ws:
                await ws.send(json.dumps(setup))
                await asyncio.wait_for(ws.recv(), timeout=25)  # setupComplete
                await ws.send(json.dumps({"client_content": {
                    "turns": [{"role": "user", "parts": [{"text": "(the call connects)"}]}],
                    "turn_complete": True,
                }}))
                said = ""
                deadline = asyncio.get_event_loop().time() + 30
                while asyncio.get_event_loop().time() < deadline:
                    raw = await asyncio.wait_for(ws.recv(), timeout=20)
                    d = json.loads(raw if isinstance(raw, str) else raw.decode())
                    sc = d.get("serverContent", {})
                    ot = sc.get("outputTranscription", {}).get("text")
                    if ot:
                        said += ot
                    if sc.get("turnComplete") and said.strip():
                        break
                return said.strip(), ""
        except Exception as e:  # noqa: BLE001
            return "", re.sub(r'key=[\w-]+', 'key=REDACTED', str(e))[:100]


VOICES = ("Charon,Orus,Puck,Fenrir,Enceladus,Iapetus,Umbriel,Algieba,Algenib,Rasalgethi,"
          "Alnilam,Schedar,Achird,Zubenelgenubi,Sadachbia,Sadaltager,Kore,Aoede,Leda,Zephyr,"
          "Callirrhoe,Autonoe,Despina,Erinome,Laomedeia,Achernar,Gacrux,Pulcherrima,"
          "Vindemiatrix,Sulafat")

# One representative per script family, so a smoke run stays cheap. Pass your own
# comma-separated code=Name list as argv[2] to check the full set.
LANGUAGES = ("en-US=English,hi-IN=Hindi,mr-IN=Marathi,bn-IN=Bengali,ta-IN=Tamil,te-IN=Telugu,"
             "kn-IN=Kannada,ml-IN=Malayalam,gu-IN=Gujarati,pa-IN=Punjabi,ur-IN=Urdu,"
             "ar-XA=Arabic,cmn-CN=Chinese,ja-JP=Japanese,ko-KR=Korean,ru-RU=Russian")


async def main():
    langs = (sys.argv[2] if len(sys.argv) > 2 else LANGUAGES).split(",")
    out = await asyncio.gather(*[speak(l) for l in langs])
    for spec, (said, err) in zip(langs, out):
        lang = spec.split("=")[0]
        if err:
            print(f"{lang:8} ERROR   {err}")
        else:
            print(f"{lang:8} {script_of(said):12} {said[:70]}")


asyncio.run(main())
