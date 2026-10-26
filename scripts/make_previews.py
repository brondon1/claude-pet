"""
动作视频 → README 用的预览 GIF（dsh-pet 同款「效果预览」）。

  python scripts/make_previews.py

输入 assets/webm/*.webm（VP9 + alpha），输出 assets/preview/<动作名>.gif：
按人物所在区域裁掉两侧空白，缩到 160px 高、10fps，透明背景铺成浅米色（GIF 不支持半透明）。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from make_video import find_ffmpeg  # noqa: E402

SRC = ROOT / 'assets' / 'webm'
OUT = ROOT / 'assets' / 'preview'
BG = '0xFFF8F0'


def main() -> None:
    ff = find_ffmpeg()
    OUT.mkdir(parents=True, exist_ok=True)
    for v in sorted(SRC.glob('*.webm')):
        dst = OUT / f'{v.stem}.gif'
        # 640×360 画面中人物在中间，裁中间 360×360 再缩放；调色板两步法保证 GIF 色彩
        vf = (f'crop=360:360:140:0,fps=10,scale=-1:160:flags=lanczos,'
              f'split[a][b];[a]palettegen=reserve_transparent=0[p];[b][p]paletteuse=dither=bayer')
        cmd = [ff, '-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', str(v),
               '-f', 'lavfi', '-i', f'color=c={BG}:s=640x360',
               '-filter_complex', f'[1][0]overlay=shortest=1,{vf}', str(dst)]
        subprocess.run(cmd, check=True, stdin=subprocess.DEVNULL)
        print(dst.name, dst.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
