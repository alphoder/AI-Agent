"""Self-check for the live-model routing.

Run: python scripts/test_model_routing.py

Guards the rule that actually matters: native audio must only ever be handed a
language code that was verified to work on it. Anything else it receives closes
the socket with 1007 mid-call, which the learner sees as the call simply dying.
"""
import sys

sys.path.insert(0, ".")

from src.config import settings  # noqa: E402
from src.routes.session import _NATIVE_AUDIO_LANGS, _bcp47, _live_model  # noqa: E402

NATIVE = settings.gemini_native_audio_model
FLASH = settings.gemini_live_model
settings.native_audio_enabled = True

# --- verified-supported codes go to native audio, with affective dialog on ---
for code in ["en-US", "hi-IN", "ja-JP", "ko-KR", "de-DE", "id-ID"]:
    model, affective = _live_model(code)
    assert model == NATIVE, f"{code} should use native audio, got {model}"
    assert affective is True, f"{code} should enable affective dialog"

# --- every regional accent must stay on flash-live: native audio 1007s on these ---
for code in ["en-IN", "en-GB", "en-AU", "en-IE", "es-ES", "fr-CA", "pt-PT"]:
    model, affective = _live_model(code)
    assert model == FLASH, f"accent {code} must stay on flash-live, got {model}"
    assert affective is False, f"accent {code} must not send the affective flag"

# --- languages native audio rejects must stay on flash-live ---
for code in ["ta-IN", "bn-IN", "mr-IN", "te-IN", "gu-IN", "kn-IN", "ml-IN",
             "pa-IN", "ur-IN", "ar-XA", "cmn-CN", "he-IL", "el-GR"]:
    model, affective = _live_model(code)
    assert model == FLASH, f"{code} is unsupported on native audio, got {model}"
    assert affective is False

# --- unknown / missing codes must never reach native audio ---
for code in [None, "", "xx-ZZ", "en", "klingon"]:
    model, affective = _live_model(code)
    assert model == FLASH, f"{code!r} must fall back to flash-live, got {model}"
    assert affective is False

# --- the kill switch really kills it ---
settings.native_audio_enabled = False
for code in ["en-US", "hi-IN", "ja-JP"]:
    model, affective = _live_model(code)
    assert model == FLASH, "kill switch must force every call to flash-live"
    assert affective is False
settings.native_audio_enabled = True

# --- the routing table must line up with what the app can actually select ---
# Every native-audio code has to be a real BCP-47 the resolver can produce,
# or the branch is dead code that never fires.
for code in _NATIVE_AUDIO_LANGS:
    assert _bcp47(code) == code, f"{code} is not a code _bcp47 can return"
assert len(_NATIVE_AUDIO_LANGS) == 18, f"expected the 18 verified codes, got {len(_NATIVE_AUDIO_LANGS)}"
assert not any("-IN" in c and c != "hi-IN" for c in _NATIVE_AUDIO_LANGS), \
    "only hi-IN survives on native audio; no other Indian code was verified"

print("test_model_routing.py: all checks passed")
