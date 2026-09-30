# Free TTS via edge-tts (no API key). Usage: python3 tools/tts.py <voice> "<text>" <out.mp3>
# Hebrew voices: he-IL-AvriNeural (male), he-IL-HilaNeural (female). List: edge-tts --list-voices
# certifi is pointed at the sandbox proxy CA bundle; remove that line outside the cloud container.
import sys, asyncio, certifi
certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
import edge_tts
voice, text, out = sys.argv[1:4]
asyncio.run(edge_tts.Communicate(text, voice).save(out))
