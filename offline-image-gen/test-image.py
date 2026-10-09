"""Makes one test image with FastSD CPU, fully offline, and saves the settings the web UI starts with.

Run with the FastSD environment's Python, from any folder:
    fastsdcpu\\env\\Scripts\\python.exe test-image.py "a red apple on a wooden table"
The image goes to test-image.png next to this script. On the first run it also saves these settings
to fastsdcpu\\configs\\settings.yaml, so the web UI starts with this model.
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("HF_HOME", os.path.join(HERE, "cache", "hf"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
sys.path.insert(0, os.path.join(HERE, "fastsdcpu", "src"))

from context import Context  # noqa: E402
from models.interface_types import InterfaceType  # noqa: E402
from state import get_settings  # noqa: E402

MODEL = "rupeshs/sdxs-512-0.9-orig-vae"
prompt = " ".join(sys.argv[1:]) or "a red apple on a wooden table, photo"
app_settings = get_settings()
s = app_settings.settings.lcm_diffusion_setting
# Save these settings for the web UI only while it has none for this model yet (first run),
# so a later rerun does not undo what the user picked in the web UI
save = s.lcm_model_id != MODEL or not s.use_offline_model
s.lcm_model_id = MODEL
s.use_offline_model = True
s.use_tiny_auto_encoder = True
s.use_openvino = False
s.use_lcm_lora = False
s.use_gguf_model = False
# The web UI may have left another mode on (image to image, ControlNet, LoRA...); the test is plain text to image
s.diffusion_task = "text_to_image"
s.init_image = None
s.controlnet = None
if s.lora:
    s.lora.enabled = False
s.use_safety_checker = False
s.token_merging = 0.0
s.clip_skip = 1
s.inference_steps = 1
s.guidance_scale = 1.0
s.image_width = 512
s.image_height = 512
s.number_of_images = 1
s.prompt = prompt

context = Context(InterfaceType.CLI)
start = time.perf_counter()
images = context.generate_text_to_image(settings=app_settings.settings, device="cpu", save_config=save)
first = time.perf_counter() - start
if not images:
    sys.exit("FAILED: no image (see the error above)")
start = time.perf_counter()
images = context.generate_text_to_image(settings=app_settings.settings, device="cpu", save_config=False)
again = time.perf_counter() - start
out = os.path.join(HERE, "test-image.png")
images[0].save(out)
print(f"RESULT first image {first:.1f}s (includes loading the model), next image {again:.1f}s, saved {out}")
