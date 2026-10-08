#!/usr/bin/env python3
"""Turn the raw sound effects (generated with ElevenLabs into assets/raw/sfx/) into small
game-ready files in assets/sfx/: mono, leading silence trimmed, peak-normalised, short
fade-out, 64 kbps MP3 (decodes in every browser). The build embeds assets/sfx/*.mp3.

Usage: python3 tools/process_sfx.py
"""
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', 'raw', 'sfx')
OUT = os.path.join(ROOT, 'assets', 'sfx')

# game sound -> chosen raw takes (the best-looking variations of each generation)
PICKS = {
    'boom_big': ['boom_big_2', 'boom_big_4', 'boom_big_1'],
    'boom_small': ['boom_small_2', 'boom_small_3'],
    'roar_big': ['roar_big_2', 'roar_big_3', 'roar_big_4'],
    'roar_small': ['roar_small_1', 'roar_small_2'],
    'shriek': ['shriek_1'],
    'missile': ['missile_1'],
    'flyby': ['flyby_1'],
    'thud': ['thud_1'],
    'clang': ['clang_1'],
    'fire': ['fire_1', 'fire_4'],
    'rumble': ['rumble_1'],
    'wind': ['wind_1'],
}
# ambience gets soft edges, everything else keeps its attack
SOFT = {'wind', 'rumble'}


def peak_db(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True)
    m = re.search(r'max_volume: (-?[\d.]+) dB', r.stderr)
    return float(m.group(1)) if m else 0.0


def duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.mp3'):
            os.remove(os.path.join(OUT, f))
    total = 0
    for key, takes in PICKS.items():
        for i, take in enumerate(takes, 1):
            src = os.path.join(RAW, take + '.mp3')
            if not os.path.exists(src):
                print('missing', src)
                continue
            dst = os.path.join(OUT, f'{key}_{i}.mp3')
            tmp = dst + '.wav'
            trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.005'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-af', trim, tmp], check=True)
            d = duration(tmp)
            gain = -1.0 - peak_db(tmp)
            fade_in = 'afade=t=in:d=0.25,' if key in SOFT else ''
            fade_out = min(0.35 if key in SOFT else 0.08, d * 0.3)
            af = f'volume={gain:.2f}dB,{fade_in}afade=t=out:st={max(0, d - fade_out):.3f}:d={fade_out:.3f}'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', af, '-ar', '44100',
                            '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', '-id3v2_version', '0', dst],
                           check=True)
            os.remove(tmp)
            size = os.path.getsize(dst)
            total += size
            print(f'{key}_{i}.mp3  {d:.2f}s  {size // 1024} KB  (from {take})')
    print(f'total {total // 1024} KB')


if __name__ == '__main__':
    main()
