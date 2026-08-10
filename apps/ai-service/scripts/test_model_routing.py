"""Self-check for the live-model routing.

Run: python scripts/test_model_routing.py

Guards the rule that actually matters: native audio must only ever be handed a
language code that was verified to work on it. Anything else it receives closes
the socket with 1007 mid-call, which the learner sees as the call simply dying.
"""
import sys

sys.path.insert(0, ".")

from src.config import settings  # noqa: E402
from src.core.live_routing import LIVE_ROUTES, NATIVE_CODES, route_for  # noqa: E402
from src.routes.session import _bcp47, _live_model  # noqa: E402

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
for code in NATIVE_CODES:
    assert _bcp47(code) == code, f"{code} is not a code _bcp47 can return"
assert len(NATIVE_CODES) == 18, f"expected the 18 measured codes, got {len(NATIVE_CODES)}"
assert not any("-IN" in c and c != "hi-IN" for c in NATIVE_CODES), \
    "only hi-IN survives on native audio; no other Indian code was measured"

# The table must cover every code the app can emit, or a real session falls
# through to the None branch and silently loses its routing row.
from src.routes.session import _BCP47  # noqa: E402
for bcp in _BCP47.values():
    assert route_for(bcp) is not None, f"{bcp} is missing from LIVE_ROUTES"
for acc in ["en-IN", "en-GB", "en-AU", "en-IE", "es-ES", "fr-CA", "pt-PT"]:
    assert route_for(acc) is not None, f"accent {acc} is missing from LIVE_ROUTES"
assert len({r.code for r in LIVE_ROUTES}) == len(LIVE_ROUTES), "duplicate codes in LIVE_ROUTES"

# --- the case that shipped broken -------------------------------------------
# The socket handler lower-cases the query param, so routing must be exercised
# with what PRODUCTION sends, not tidy uppercase codes. Testing `en-US` proved
# nothing: the wire only ever carries `en-us`.
LOWER_TO_NATIVE = ["en", "en-us", "hi", "hi-in", "ja", "ja-jp", "de", "de-de", "es-us"]
for raw in LOWER_TO_NATIVE:
    model, affective = _live_model(_bcp47(raw))
    assert model == NATIVE, f"lowercase {raw!r} must reach native audio, got {model}"
    assert affective is True

LOWER_TO_FLASH = ["en-in", "en-gb", "en-au", "en-ie", "es-es", "fr-ca", "pt-pt",
                  "ta-in", "bn-in", "ar-xa", "cmn-cn"]
for raw in LOWER_TO_FLASH:
    model, affective = _live_model(_bcp47(raw))
    assert model == FLASH, f"lowercase {raw!r} must stay on flash-live, got {model}"
    assert affective is False

# Canonical casing, including the three-letter primary tags in the catalogue.
assert _bcp47("en-in") == "en-IN"
assert _bcp47("cmn-cn") == "cmn-CN"
assert _bcp47("fil-ph") == "fil-PH"
assert _bcp47("yue-hk") == "yue-HK"
assert _bcp47("en") == "en-US"

# Hindi auto-selects its single accent variant in the picker, so hi and hi-in
# must land identically or every Hindi call quietly loses native audio.
assert _live_model(_bcp47("hi")) == _live_model(_bcp47("hi-in"))

print("test_model_routing.py: all checks passed")
