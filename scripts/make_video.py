"""
绿幕动作视频 → 桌宠用的透明 webm（版式与 dsh-pet 一致，可与立绘无缝切换）。

  python scripts/make_video.py                 # 处理 assets/video/ 下全部视频
  python scripts/make_video.py work.mp4 ...    # 只处理指定文件
  python scripts/make_video.py --watermark 0.80,0.90,1,1   # 水印区域（相对坐标 x0,y0,x1,y1），默认右下角

输入：assets/video/<动作名>.mp4|mov|webm（AI 生成的 16:9 绿幕视频，提示词见 docs/动作视频提示词.md）
输出：assets/webm/<动作名>.webm（640×360，VP9 + alpha）
  - 文件名是内置动作名（如 work、eat、sleep）→ 替换该动作的画面；
  - 其他名字（如 吃冰淇淋）→ 作为新的休闲动作加入动画链和右键菜单。

处理步骤：
1. 水印区域刷成纯绿，随背景一起抠掉（提示词要求人物不进入角落，所以不会误伤）；
2. HSV 色相判定抠绿幕：只有「绿色色相 + 足够饱和 / 明度」的像素算背景，蓝 / 白 / 橙永不误抠；边缘去绿溢色；
3. 统一大小与位置：只量与脚连通的角色本体（特效不算）；AI 偶尔推拉镜头，检测到时以占多数的尺寸为准并剪掉首尾过渡帧；
   取开头几帧（标准站立）的本体框，缩放到站立高度 = 画面高 × 900/1215，
   脚底落在 1115/1215 处，水平居中——与立绘、dsh-pet 素材同一版式；
4. VP9 + alpha 编码。

需要 ffmpeg（含 libvpx）：环境变量 FFMPEG → PATH 中的 ffmpeg → pip 包 imageio-ffmpeg，依次查找。
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IN_DIR = ROOT / 'assets' / 'video'
OUT_DIR = ROOT / 'assets' / 'webm'

SRC_W, SRC_H, FPS = 1280, 720, 24
OUT_W, OUT_H = 640, 360
# 版式：人物站立高度 / 脚底位置占画面高度的比例（与 dsh-pet 的 2160×1215 母版一致）
STAND_RATIO = 900 / 1215
FEET_RATIO = 1115 / 1215
# 取开头多少帧量「标准站立」框（提示词要求第一帧是标准正面站立）
HEAD_FRAMES = 5

# 绿幕判定（HSV）
GREEN_HUE_MIN, GREEN_HUE_MAX = 70.0, 170.0
SAT_MIN, VAL_MIN = 0.15, 0.15
HUE_FEATHER = 6.0

DEFAULT_WATERMARK = (0.78, 0.90, 1.0, 1.0)
VIDEO_EXTS = {'.mp4', '.mov', '.webm', '.mkv'}


# ===================== 纯计算（可单测） =====================
def paint_watermark(rgb: np.ndarray, box: tuple[float, float, float, float] | None) -> np.ndarray:
    """把相对坐标 box 内的像素刷成纯绿，让水印随背景一起被抠掉。"""
    if not box:
        return rgb
    h, w, _ = rgb.shape
    x0, y0, x1, y1 = box
    out = rgb.copy()
    out[int(y0 * h) : int(y1 * h), int(x0 * w) : int(x1 * w)] = (0, 255, 0)
    return out


def chroma_key(rgb: np.ndarray) -> np.ndarray:
    """HSV 色相判定抠绿幕，返回 RGBA（uint8）。绿色方向的像素按饱和 / 明度 / 色相边缘羽化给透明度，并去绿溢色。"""
    f = rgb.astype(np.float32) / 255.0
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = f.max(axis=2)
    mn = f.min(axis=2)
    delta = mx - mn
    sat = np.where(mx > 0, delta / np.maximum(mx, 1e-6), 0)
    # 色相（度）
    hue = np.zeros_like(mx)
    safe = np.maximum(delta, 1e-6)
    hr = (60 * ((g - b) / safe) + 360) % 360
    hg = 60 * ((b - r) / safe) + 120
    hb = 60 * ((r - g) / safe) + 240
    hue = np.where(mx == r, hr, np.where(mx == g, hg, hb))
    hue = np.where(delta > 1e-6, hue, -1000)  # 无色相（灰白黑）永不算背景

    def ramp(x, lo, hi):
        return np.clip((x - lo) / max(hi - lo, 1e-6), 0, 1)

    in_hue = np.minimum(
        ramp(hue, GREEN_HUE_MIN - HUE_FEATHER, GREEN_HUE_MIN + HUE_FEATHER),
        1 - ramp(hue, GREEN_HUE_MAX - HUE_FEATHER, GREEN_HUE_MAX + HUE_FEATHER),
    )
    bgness = in_hue * ramp(sat, SAT_MIN, SAT_MIN + 0.25) * ramp(mx, VAL_MIN, VAL_MIN + 0.25)
    alpha = 1 - bgness
    # 去绿溢色：偏绿的半透明边缘把 g 压到 max(r, b)
    spill = (g > np.maximum(r, b)) & (alpha < 0.999)
    g2 = np.where(spill, np.maximum(r, b), g)
    out = np.dstack([r, g2, b, alpha])
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


def content_box(rgba: np.ndarray, thresh: int = 40) -> tuple[int, int, int, int] | None:
    """不透明内容的包围盒 (x0, y0, x1, y1)，含右下边界；全透明返回 None。"""
    ys, xs = np.nonzero(rgba[..., 3] > thresh)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def standing_layout(boxes: list[tuple[int, int, int, int]], out_w: int = OUT_W, out_h: int = OUT_H) -> dict:
    """由开头几帧的人物框算出缩放比例与平移：站立高度、脚底线、水平居中都对齐到统一版式。

    开头几帧难免已经开始动（起跳、踮脚），所以身高与水平中心取中位数，
    脚底取最低的那一帧——那才是脚踩地的标准站立。
    """
    arr = np.array(boxes, dtype=np.float64)
    height = max(float(np.median(arr[:, 3] - arr[:, 1])), 1.0)
    cx = float(np.median((arr[:, 0] + arr[:, 2]) / 2))
    feet = float(arr[:, 3].max())
    scale = STAND_RATIO * out_h / height
    return {'scale': scale, 'dx': out_w / 2 - cx * scale, 'dy': FEET_RATIO * out_h - feet * scale}


def place(rgba: np.ndarray, layout: dict, out_w: int = OUT_W, out_h: int = OUT_H) -> np.ndarray:
    """按 layout 缩放平移到输出画布（透明底）；超出画布的部分裁掉。"""
    h, w, _ = rgba.shape
    s = layout['scale']
    sw, sh = max(1, round(w * s)), max(1, round(h * s))
    im = Image.fromarray(rgba, 'RGBA').resize((sw, sh), Image.LANCZOS)
    x, y = round(layout['dx']), round(layout['dy'])
    # 与画布的重叠区域（源图坐标）
    l, t = max(0, -x), max(0, -y)
    r, btm = min(sw, out_w - x), min(sh, out_h - y)
    canvas = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    if r > l and btm > t:
        canvas.alpha_composite(im.crop((l, t, r, btm)), (x + l, y + t))
    return np.asarray(canvas)


# ===================== ffmpeg 读写 =====================
def find_ffmpeg() -> str:
    exe = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit('找不到 ffmpeg：请安装 ffmpeg 并加入 PATH，或设置环境变量 FFMPEG，或 `pip install imageio-ffmpeg`。')


def read_frames(ffmpeg: str, src: Path, w: int = SRC_W, h: int = SRC_H):
    """逐帧产出 RGB 数组（统一到 w×h、FPS 帧率）。"""
    cmd = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(src),
           '-vf', f'fps={FPS},scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0x00FF00',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = w * h * 3
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    finally:
        proc.stdout.close()
        proc.wait()


def encode(ffmpeg: str, frames, dst: Path) -> None:
    """RGBA 帧序列编码成 VP9 + alpha webm。"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
           '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{OUT_W}x{OUT_H}', '-r', str(FPS), '-i', '-',
           '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '30', '-b:v', '0',
           '-auto-alt-ref', '0', '-an', str(dst)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in frames:
        proc.stdin.write(np.ascontiguousarray(f).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError(f'ffmpeg 编码失败：{dst}')


def pick_standing(boxes: list, w: int = SRC_W, h: int = SRC_H, n: int = HEAD_FRAMES) -> list:
    """挑「标准站立」参考帧：人物完整入画（不贴画面边缘）的开头几帧；开头不行（如镜头一开始就推得很近）就用结尾几帧。"""
    def whole(bx):
        return bx is not None and bx[1] > 2 and bx[3] < h - 3 and bx[0] > 2 and bx[2] < w - 3

    head = [bx for bx in boxes[:n] if whole(bx)]
    if len(head) >= 2:
        return head
    tail = [bx for bx in boxes[-n:] if whole(bx)]
    return tail if len(tail) >= 2 else head + tail


def body_box(rgba: np.ndarray, step: int = 4, thresh: int = 40) -> tuple[int, int, int, int] | None:
    """角色本体的包围盒：只算与脚（最低处的不透明像素）连通的部分，飘在身边的彩带、音符、问号等特效不计入。
    在降采样的 alpha 上做连通，返回原图坐标。"""
    m = rgba[::step, ::step, 3] > thresh
    if not m.any():
        return None
    ys, xs = np.nonzero(m)
    low = ys.max()
    cols = xs[ys == low]
    seed = np.zeros_like(m)
    seed[low, cols[np.argmin(np.abs(cols - m.shape[1] / 2))]] = True
    cur = seed
    while True:
        nxt = cur.copy()
        nxt[1:] |= cur[:-1]
        nxt[:-1] |= cur[1:]
        nxt[:, 1:] |= cur[:, :-1]
        nxt[:, :-1] |= cur[:, 1:]
        nxt[1:, 1:] |= cur[:-1, :-1]
        nxt[1:, :-1] |= cur[:-1, 1:]
        nxt[:-1, 1:] |= cur[1:, :-1]
        nxt[:-1, :-1] |= cur[1:, 1:]
        nxt &= m
        if (nxt == cur).all():
            break
        cur = nxt
    ys, xs = np.nonzero(cur)
    return int(xs.min()) * step, int(ys.min()) * step, int(xs.max()) * step + step - 1, int(ys.max()) * step + step - 1


ZOOM_TOL = 1.25   # 本体高度相差超过这个倍数 → 判定镜头推拉
TRIM_TOL = 0.15   # 推拉片段：与主体尺寸相差超过 15% 的首尾帧剪掉


def camera_zoom(heights: list) -> tuple[float, int, int]:
    """检测镜头推拉。heights 是逐帧本体高度（None = 无人物）。
    返回 (最大/最小高度比, 保留区间起点, 终点(不含))：有推拉时以「占多数的尺寸」(中位数) 为准，
    剪掉首尾与它相差超过 TRIM_TOL 的过渡帧；中途的差异（举手、蹲下）保留。"""
    hs = [h for h in heights if h]
    if not hs:
        return 1.0, 0, len(heights)
    ratio = max(hs) / min(hs)
    if ratio <= ZOOM_TOL:
        return ratio, 0, len(heights)
    med = float(np.median(hs))
    off = [not h or abs(h / med - 1) > TRIM_TOL for h in heights]
    i0 = 0
    while i0 < len(off) and off[i0]:
        i0 += 1
    i1 = len(off)
    while i1 > i0 and off[i1 - 1]:
        i1 -= 1
    return ratio, i0, i1


def process(ffmpeg: str, src: Path, watermark) -> Path:
    # 第一遍：逐帧量本体框（不含特效），检查镜头推拉，挑标准站立帧定版式
    bodies = [body_box(chroma_key(paint_watermark(rgb, watermark))) for rgb in read_frames(ffmpeg, src)]
    ratio, i0, i1 = camera_zoom([bx[3] - bx[1] if bx else None for bx in bodies])
    if (i0, i1) != (0, len(bodies)):
        print(f'  ! {src.name}：镜头推拉 {ratio:.1f} 倍，以主体尺寸为准，剪掉首尾过渡 '
              f'{i0 / FPS:.1f}s + {(len(bodies) - i1) / FPS:.1f}s')
    kept = bodies[i0:i1]
    standing = pick_standing(kept)
    if not standing:
        raise RuntimeError(f'{src.name}：找不到人物完整入画的站立帧，检查是不是绿幕、人物有没有出画')
    layout = standing_layout(standing)
    valid = [bx for bx in kept if bx is not None]
    s, dx, dy = layout['scale'], layout['dx'], layout['dy']
    ux0 = min(bx[0] for bx in valid) * s + dx
    uy0 = min(bx[1] for bx in valid) * s + dy
    ux1 = max(bx[2] for bx in valid) * s + dx
    uy1 = max(bx[3] for bx in valid) * s + dy
    if ux0 < 0 or uy0 < 0 or ux1 > OUT_W or uy1 > OUT_H:
        print(f'  ! {src.name}：角色动作超出画布，边缘会被裁掉（{ux0:.0f},{uy0:.0f})-({ux1:.0f},{uy1:.0f}）')
    # 第二遍：抠像 + 版式对齐 + 编码（只编保留区间）
    dst = OUT_DIR / f'{src.stem}.webm'
    frames = (place(chroma_key(paint_watermark(rgb, watermark)), layout)
              for i, rgb in enumerate(read_frames(ffmpeg, src)) if i0 <= i < i1)
    encode(ffmpeg, frames, dst)
    return dst


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('files', nargs='*', help='assets/video 下的文件名；不填则处理全部')
    ap.add_argument('--watermark', default=','.join(map(str, DEFAULT_WATERMARK)),
                    help='水印区域 x0,y0,x1,y1（0~1 相对坐标）；填 none 关闭')
    args = ap.parse_args()
    wm = None if args.watermark == 'none' else tuple(float(v) for v in args.watermark.split(','))
    srcs = [IN_DIR / f for f in args.files] if args.files else sorted(p for p in IN_DIR.glob('*') if p.suffix.lower() in VIDEO_EXTS)
    if not srcs:
        sys.exit(f'没有视频：把绿幕视频放进 {IN_DIR}')
    ffmpeg = find_ffmpeg()
    for src in srcs:
        print(f'处理 {src.name} …')
        print(f'  → {process(ffmpeg, src, wm)}')


if __name__ == '__main__':
    main()
