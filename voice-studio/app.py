#!/usr/bin/env python3
"""voice-studio web UI (Hebrew, RTL): speak, clone, design, convert and add effects from the browser.

Run:  .venv/bin/python app.py      then open http://127.0.0.1:7860
Local only by default; pass --share for a temporary public Gradio link.
"""
import argparse
import tempfile
from pathlib import Path

import gradio as gr

import voice as vs

OUT_DIR = Path(tempfile.gettempdir()) / "voice-studio-ui"
OUT_DIR.mkdir(exist_ok=True)
EFFECTS = ["deep", "deeper", "chipmunk", "child", "giant", "robot", "whisper", "radio", "telephone",
           "megaphone", "echo", "hall", "cave", "alien", "monster", "underwater", "slow", "fast"]
LANG_CHOICES = [("זיהוי אוטומטי", "")] + [(code, code) for code in vs.LANGS]
CONSENT_LABELS = [
    ("זה הקול שלי", "self"),
    ("קיבלתי רשות מפורשת מבעל הקול", "permission"),
    ("זה קול סינתטי, לא של אדם אמיתי", "synthetic"),
]
CSS = "body, .gradio-container { direction: rtl; } textarea, input { direction: auto; }"


def voice_names():
    return [v["name"] for v in vs.list_voices()]


def _out(suffix=".wav"):
    return str(Path(tempfile.mkstemp(suffix=suffix, dir=OUT_DIR)[1]))


def _run(fn, *args):
    try:
        return fn(*args)
    except vs.VoiceError as e:
        raise gr.Error(str(e))


def ui_speak(text, voice, lang, exaggeration, cfg, effects, seed):
    wav, _ = _run(vs.synthesize, text, voice, lang or None, exaggeration, cfg, 0.8,
                  int(seed) if seed not in (None, "") else None, ",".join(effects or []))
    return vs.save_audio(_out(), wav)


def ui_clone(name, sample, consent, note):
    if not sample:
        raise gr.Error("העלו או הקליטו דגימת קול (10-30 שניות של דיבור נקי).")
    if not consent:
        raise gr.Error("חובה לסמן הצהרת הסכמה לפני שיבוט קול.")
    meta = _run(vs.add_voice, name.strip(), sample, consent, note, "", 30.0, True)
    return (f"הקול '{meta['name']}' נשמר ({meta['seconds']} שניות). הוא זמין עכשיו בלשונית דיבור.",
            *_refreshed(meta["name"]))


def ui_design(name, pitch, base, effects):
    meta = _run(vs.design_voice, name.strip(), pitch, None if base == "default" else base,
                ",".join(effects or []) or None, 0.5, "he", 0, "", None, True)
    return f"הקול '{meta['name']}' עוצב ונשמר. הוא זמין עכשיו בלשונית דיבור.", *_refreshed(meta["name"])


def _refreshed(new_name):
    """Updates for the three voice dropdowns (speak, design base, convert target) after a voice was added."""
    names = voice_names()
    return gr.update(choices=names, value=new_name), gr.update(choices=names), gr.update(choices=names, value=new_name)


def ui_convert(source, voice, effects):
    if not source:
        raise gr.Error("העלו או הקליטו את ההקלטה שרוצים להמיר.")
    return vs.save_audio(_out(), _run(vs.convert, source, voice, ",".join(effects or [])))


def ui_effects(source, effects):
    if not source or not effects:
        raise gr.Error("בחרו קובץ ולפחות אפקט אחד.")
    return vs.save_audio(_out(), _run(lambda: vs.apply_effects(vs.load_audio(source), vs.SR, ",".join(effects))))


def build():
    with gr.Blocks(title="סטודיו הקולות") as demo:
        gr.Markdown("# 🎙️ סטודיו הקולות\nדיבור מטקסט, שיבוט קול, עיצוב קולות חדשים, המרת קול ואפקטים — הכול מקומי. "
                    "כל קובץ שנוצר מסומן בסימן מים בלתי נשמע שמזהה אותו כמיוצר ב-AI.")
        with gr.Tab("🗣️ דיבור"):
            text = gr.Textbox(label="מה להגיד?", lines=4, value="שלום! זה הקול החדש שלי.")
            with gr.Row():
                voice = gr.Dropdown(voice_names(), value="default", label="קול")
                lang = gr.Dropdown(LANG_CHOICES, value="", label="שפה")
                seed = gr.Number(label="Seed (לא חובה)", value=None, precision=0)
            with gr.Row():
                exaggeration = gr.Slider(0.25, 2.0, 0.5, step=0.05, label="רגש / דרמטיות")
                cfg = gr.Slider(0.0, 1.0, 0.5, step=0.05, label="קצב (נמוך = איטי ורגוע)")
            effects = gr.CheckboxGroup(EFFECTS, label="אפקטים (לא חובה)")
            out = gr.Audio(label="תוצאה", type="filepath")
            gr.Button("צור דיבור", variant="primary").click(
                ui_speak, [text, voice, lang, exaggeration, cfg, effects, seed], out)
        with gr.Tab("🧬 שיבוט קול"):
            gr.Markdown("העלו או הקליטו **10-30 שניות** של דיבור נקי, בלי מוזיקה ורעשים. "
                        "שבטו רק את הקול שלכם או קול של מי שנתן לכם רשות מפורשת.")
            name = gr.Textbox(label="שם לקול (אנגלית/עברית, בלי רווחים)", value="my_voice")
            sample = gr.Audio(label="דגימת קול", sources=["upload", "microphone"], type="filepath")
            consent = gr.Radio(CONSENT_LABELS, label="הצהרת הסכמה (חובה)")
            note = gr.Textbox(label="הערה (מי נתן רשות ומתי)")
            status = gr.Markdown()
            clone_btn = gr.Button("שמור קול", variant="primary")
        with gr.Tab("🎨 עיצוב קול חדש"):
            gr.Markdown("ממציאים קול סינתטי חדש בלי שום הקלטה של אדם אמיתי: מזיזים את גובה הקול ומוסיפים אופי.")
            dname = gr.Textbox(label="שם לקול החדש", value="new_voice")
            pitch = gr.Slider(-8, 8, -3, step=0.5, label="גובה (שליליים = עמוק יותר, חיוביים = צעיר/גבוה יותר)")
            base = gr.Dropdown(voice_names(), value="default", label="קול בסיס")
            deffects = gr.CheckboxGroup(["radio", "telephone", "whisper", "hall"], label="אופי (לא חובה)")
            dstatus = gr.Markdown()
            design_btn = gr.Button("עצב קול", variant="primary")
        with gr.Tab("🔁 המרת קול"):
            gr.Markdown("מקליטים משפט בקול שלכם — והוא יוצא באותן מילים ובאותה אינטונציה, בקול אחר.")
            src = gr.Audio(label="ההקלטה המקורית", sources=["upload", "microphone"], type="filepath")
            target = gr.Dropdown(voice_names(), value=(voice_names()[1:] or ["default"])[0], label="קול יעד")
            ceffects = gr.CheckboxGroup(EFFECTS, label="אפקטים (לא חובה)")
            cout = gr.Audio(label="תוצאה", type="filepath")
            gr.Button("המר", variant="primary").click(ui_convert, [src, target, ceffects], cout)
        with gr.Tab("🎛️ אפקטים"):
            esrc = gr.Audio(label="קובץ שמע", sources=["upload", "microphone"], type="filepath")
            eeffects = gr.CheckboxGroup(EFFECTS, label="אפקטים (לפי הסדר)")
            eout = gr.Audio(label="תוצאה", type="filepath")
            gr.Button("החל אפקטים", variant="primary").click(ui_effects, [esrc, eeffects], eout)
        clone_btn.click(ui_clone, [name, sample, consent, note], [status, voice, base, target])
        design_btn.click(ui_design, [dname, pitch, base, deffects], [dstatus, voice, base, target])
    return demo


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=7860)
    p.add_argument("--share", action="store_true", help="create a temporary public link")
    a = p.parse_args()
    build().queue().launch(server_port=a.port, share=a.share, css=CSS)
