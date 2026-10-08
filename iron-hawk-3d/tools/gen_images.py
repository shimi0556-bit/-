#!/usr/bin/env python3
"""Generate the game's 2D art with Gemini image models.

Reads the API key from the GEMINI_API_KEY environment variable only; the key is
never written to disk by this script and must never be committed.

    GEMINI_API_KEY=... python3 tools/gen_images.py            # all missing images
    GEMINI_API_KEY=... python3 tools/gen_images.py tex_grass  # just these names
    OUT_DIR=/some/dir GEMINI_API_KEY=... python3 tools/gen_images.py  # write somewhere else

Raw PNGs land in assets/raw/ (git-ignored); tools/process_images.py turns them
into the small files the game embeds.
"""
import base64, json, os, ssl, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('OUT_DIR') or os.path.join(HERE, '..', 'assets', 'raw')
MODEL = os.environ.get('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image')

NO = ' No text, no letters, no logos, no watermark, no people, no humans.'
TEX = (' Seamless tileable texture, orthographic view from directly above, flat even lighting,'
       ' no perspective, no vignette, no strong baked shadows, PBR-friendly albedo, photorealistic, sharp detail.' + NO)
CARD = (' Video game bestiary card illustration, dramatic rim lighting, high-end 3D render in the style of a'
        ' AAA game, full body visible, centered, dark smoky background with soft orange glow, no blood.' + NO)
SCENE = ' Cinematic AAA video game art, Unreal Engine 5 style 3D render, epic scale, volumetric light.' + NO

IMAGES = {
  # menu and loading art
  'key_art': ('16:9', '2K',
    'Epic video game key art: a sleek modern grey twin-tail fighter jet with a gold-tinted canopy banks hard over a lush'
    ' green mountain valley at golden hour, firing glowing tracer rounds and launching a missile with a white smoke trail'
    ' at a giant dark-red scaly two-legged monster with huge jaws and glowing orange eyes roaring in the valley below.'
    ' A colossal long-necked monster wades in a lake in the distance, bat-winged flying monsters circle the clouds,'
    ' sun flare, dramatic clouds, explosions of fire and dust.' + SCENE),
  'region_valley': ('16:9', '2K',
    'Aerial view of a lush green mountain valley with a winding blue river, a calm lake, dense pine forests, grassy'
    ' meadows and grey rocky peaks, soft morning light and low mist, a few giant monsters visible far below as'
    ' small silhouettes.' + SCENE),
  'region_canyon': ('16:9', '2K',
    'Aerial view of a vast red rock desert canyon with towering mesas, winding dry riverbed, scattered green shrubs,'
    ' warm golden sunset light with long shadows and dust in the air, giant monster silhouettes far below.' + SCENE),
  'region_volcano': ('16:9', '2K',
    'Aerial view of a dark volcanic land at dusk with rivers of glowing orange lava, black basalt ridges, ash clouds,'
    ' a huge erupting volcano on the horizon lighting the clouds red, glowing embers in the air.' + SCENE),

  # terrain and material textures (tiled in the shaders)
  'tex_grass': ('1:1', '1K', 'Dense short green meadow grass with patches of moss, clover and tiny pebbles.' + TEX),
  'tex_dirt':  ('1:1', '1K', 'Brown forest floor soil with small stones, dry pine needles and twigs.' + TEX),
  'tex_rock':  ('1:1', '1K', 'Rough grey granite cliff rock surface with cracks, lichen spots and layered strata.' + TEX),
  'tex_sand':  ('1:1', '1K', 'Red-orange desert sand and hard packed earth with small pebbles and cracks.' + TEX),
  'tex_ash':   ('1:1', '1K', 'Dark black volcanic basalt rock and grey ash ground with small porous stones.' + TEX),
  'tex_lava':  ('1:1', '1K', 'Molten glowing orange and yellow lava flowing between cracked black cooled crust plates.' + TEX),
  'tex_scales':('1:1', '1K', 'Close-up of reptile skin with overlapping rounded scales of varied size, neutral light'
                ' grey-green colour, subtle bumps and crevices between scales.' + TEX),
  'tex_hide':  ('1:1', '1K', 'Close-up of thick rough wrinkled leathery creature hide with pebbly bumps and folds,'
                ' neutral light grey colour.' + TEX),

  # bestiary portraits
  'mon_raptor':   ('1:1', '1K', 'A small fast two-legged reptile monster with a slender body, long stiff tail, sickle'
                   ' claws on its feet, teal-green skin with dark stripes and a pale belly, yellow eyes, mid sprint.' + CARD),
  'mon_horned':   ('1:1', '1K', 'A massive four-legged armoured monster with a huge bony neck frill and three long horns,'
                   ' olive-brown scaly skin and an orange frill, charging forward.' + CARD),
  'mon_longneck': ('1:1', '1K', 'A colossal four-legged monster with a very long neck, long tail and small head,'
                   ' blue-grey wrinkled skin with a pale belly, towering over pine trees.' + CARD),
  'mon_rex':      ('1:1', '1K', 'A huge two-legged predator monster with enormous jaws full of teeth, tiny arms, a heavy'
                   ' tail, dark red-brown scaly skin with black stripes, glowing orange eyes, spitting a fireball.' + CARD),
  'mon_flyer':    ('1:1', '1K', 'A flying monster with wide leathery bat-like wings, a long pointed beak and a crest on'
                   ' its head, purple-grey skin, glowing green eyes, diving through clouds.' + CARD),
  'mon_boss':     ('1:1', '1K', 'A colossal four-legged lava monster with black volcanic rock armour, glowing orange lava'
                   ' cracks, three big glowing crystal spikes on its back and blazing eyes, standing in a lava lake.' + CARD),
}


def ctx():
    c = ssl.create_default_context()
    bundle = os.environ.get('SSL_CERT_FILE') or '/root/.ccr/ca-bundle.crt'
    if os.path.exists(bundle):
        c.load_verify_locations(bundle)
    return c


def generate(name):
    aspect, size, prompt = IMAGES[name]
    out = os.path.join(RAW, name + '.png')
    if os.path.exists(out):
        return name, 'exists'
    key = os.environ['GEMINI_API_KEY']
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent'
    body = json.dumps({
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'generationConfig': {'responseModalities': ['IMAGE'],
                             'imageConfig': {'aspectRatio': aspect, 'imageSize': size}},
    }).encode()
    last = ''
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
            with urllib.request.urlopen(req, timeout=240, context=ctx()) as r:
                data = json.load(r)
            for cand in data.get('candidates', []):
                for part in cand.get('content', {}).get('parts', []):
                    inline = part.get('inlineData') or part.get('inline_data')
                    if inline and inline.get('data'):
                        with open(out, 'wb') as f:
                            f.write(base64.b64decode(inline['data']))
                        return name, 'ok'
            last = 'no image in response: ' + json.dumps(data)[:300]
        except Exception as e:  # network or quota: back off and retry
            last = repr(e)[:300]
        time.sleep(5 * (attempt + 1))
    return name, 'FAILED ' + last


if __name__ == '__main__':
    os.makedirs(RAW, exist_ok=True)
    names = sys.argv[1:] or list(IMAGES)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for name, status in ex.map(generate, names):
            print(f'{name}: {status}', flush=True)
