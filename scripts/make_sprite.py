"""
参考立绘 → 透明桌宠素材。

  python scripts/make_sprite.py [pet]

  pet：贴纸版全身立绘 → assets/sprite/pet.png（完整图）、pet-body.png / pet-leg-l.png / pet-leg-r.png（拆层），
       以及 pet-flower.png、icon.png / icon.ico

1. 从四边泛洪找出与背景色相近、且和边缘连通的像素，置为全透明（角色内部的白色衣服不会被误抠）；
2. 抠图边缘按与背景色的距离给半透明，并去掉背景色溢出，避免白边；
3. 去掉不属于角色的东西：右下角水印、左下角那摞书（只保留与角色主体连通的部分）；
4. 裁到不透明包围盒，等比缩到配置的高度。

源图、需要手工量的坐标（书的多边形、阴影线、花、图标框）都在 POSES 里；换源图时重新量。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / 'assets' / 'source'
OUT_DIR = ROOT / 'assets' / 'sprite'

# books：与角色粘连的书（源图坐标多边形），不粘连的书靠连通性自动去掉，填 None
# flower：输出图上发饰花的圆心与半径；icon：输出图上脸部方块（只有主形象出图标）
POSES = {
    # 贴纸版全身立绘：外圈白边 + 深色描线，背景泛洪会停在描线外，白边整圈保留
    'pet': {
        'src': 'sticker.webp',
        'height': 900,
        'pockets': False,  # 贴纸白边被描线围住、颜色又接近背景，不能做「漏底小块」检测，否则白边会被吃掉
        'books': None,
        'shadow_y': None,
        'flower': ((348, 122), 40),
        # 双腿拆层（输出图坐标）：cut 以下的腿从身体上拿掉；腿层多留 overlap 像素藏在裙子下面，
        # 抬腿 / 下垂时不露断口；split 是两腿之间的竖直分界
        'legs': {'cut': 706, 'overlap': 16, 'split': 245},
        'icon': (120, 150, 340, 370),
    },
    # 趴在屏幕边上 / 趴着：豆包生成的三张姿势图。crop 先在源图上裁：左右两张裁到「墙」（屏幕边）那条竖线为止，
    # 角色被墙挡住的一侧就是图片边缘；底部都裁在右下角水印上方（水印压在手 / 腿上，抠不掉），这部分在任务栏后面看不到
    # cut：哪几条边是裁出来的（那里是角色本体，不能当背景种子，否则贴着切口的白衣服会被当背景抠掉）；
    # 趴着那张底边穿过两只手之间的背景，必须从底边抠，所以不算
    'pet-edge-left': {'src': 'edge-left.webp', 'crop': (111, 0, 1312, 1555), 'cut': ('left', 'bottom'), 'height': 900, 'pockets': False},
    'pet-edge-right': {'src': 'edge-right.webp', 'crop': (0, 0, 1214, 1555), 'cut': ('right', 'bottom'), 'height': 900, 'pockets': False},
    # 趴在上边框往下探头：裁到那条横线（屏幕上沿）下面，手扒在线上的部分就是图片顶边
    'pet-edge-top': {'src': 'edge-top.webp', 'crop': (0, 98, 1312, 1555), 'cut': ('top',), 'height': 900, 'pockets': False},
    'pet-lie': {'src': 'lie.webp', 'crop': (0, 0, 1312, 1555), 'cut': (), 'height': 900, 'pockets': False},
}
pose = sys.argv[1] if len(sys.argv) > 1 else 'pet'
cfg = POSES[pose]
src = SRC_DIR / cfg['src']
dst = OUT_DIR / f'{pose}.png'

srcimg = Image.open(src).convert('RGB')
if cfg.get('crop'):
    srcimg = srcimg.crop(cfg['crop'])
img = np.asarray(srcimg).astype(np.float32)
H, W, _ = img.shape

# 背景色：取四角中位数
corners = np.concatenate([img[:20, :20], img[:20, -20:], img[-20:, :20], img[-20:, -20:]]).reshape(-1, 3)
bg = np.median(corners, axis=0)
dist = np.sqrt(((img - bg) ** 2).sum(axis=2))

BG_TOL = 16  # 与背景色距离小于它视为「像背景」
like_bg = dist < BG_TOL


def grow(seed, allowed):
    """在 allowed 内从 seed 做 4 邻接泛洪（numpy 迭代膨胀）。"""
    cur = seed & allowed
    while True:
        nxt = cur.copy()
        nxt[1:] |= cur[:-1]
        nxt[:-1] |= cur[1:]
        nxt[:, 1:] |= cur[:, :-1]
        nxt[:, :-1] |= cur[:, 1:]
        nxt &= allowed
        if (nxt == cur).all():
            return cur
        cur = nxt


border = np.zeros((H, W), bool)
border[0], border[-1], border[:, 0], border[:, -1] = True, True, True, True
# 裁过的图：被裁开的那几条边上是角色本体，不能当背景种子——只从源图原本的边开始泛洪
for side in cfg.get('cut', ()):
    {'top': border[0], 'bottom': border[-1], 'left': border[:, 0], 'right': border[:, -1]}[side][:] = False
background = grow(border, like_bg)

# 发丝之间被围住的背景小块：与边缘不连通，泛洪抠不到。和脸、白裙同色，只能看「四周是什么」——
# 一块近背景色区域，外圈几乎全是头发（橙）或描线（深色），就判为漏底的背景
from collections import deque

POCKET_TOL = 10
hairish = (img[..., 0] > 150) & (img[..., 1] > 50) & (img[..., 1] < 175) & (img[..., 2] < 120)
outline = img.mean(axis=2) < 110
enclosed = (dist < POCKET_TOL) & ~background if cfg['pockets'] else np.zeros((H, W), bool)
seen = np.zeros((H, W), bool)
pockets = np.zeros((H, W), bool)
for y0, x0 in zip(*np.nonzero(enclosed)):
    if seen[y0, x0]:
        continue
    comp = []
    q = deque([(y0, x0)])
    seen[y0, x0] = True
    while q:
        y, x = q.popleft()
        comp.append((y, x))
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < H and 0 <= nx < W and enclosed[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    if len(comp) < 30:
        continue
    cy, cx = np.array(comp).T
    m = np.zeros((H, W), bool)
    m[cy, cx] = True
    # 外圈：向外扩 3px 的环
    ring = m.copy()
    for _ in range(3):
        ring[1:] |= ring[:-1]
        ring[:-1] |= ring[1:]
        ring[:, 1:] |= ring[:, :-1]
        ring[:, :-1] |= ring[:, 1:]
    ring &= ~m & ~(dist < BG_TOL)
    if ring.sum() and (hairish | outline)[ring].mean() > 0.9:
        pockets |= m
background = grow(background | pockets, like_bg | pockets)

# 地面阴影：指定高度以下的浅色像素，只要和背景连通就并入背景（鞋口里露出的脚背被黑色描线围着，不会被吃掉）
if cfg.get('shadow_y'):
    low = np.zeros((H, W), bool)
    low[cfg['shadow_y'] :] = True
    background = grow(background, background | (low & (img.mean(axis=2) > 135)))

# 只保留与角色主体（画面中心）连通的不透明区域：去掉水印、书等孤立物件
fg = ~background
center = np.zeros((H, W), bool)
center[H // 2 - 5 : H // 2 + 5, W // 2 - 5 : W // 2 + 5] = True
body = grow(center, fg)

# 书紧贴着裙摆时连通性分不开：沿裙摆外轮廓画多边形把书切掉，切剩的碎块再按连通性丢弃
if cfg.get('books'):
    mask_img = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask_img).polygon(cfg['books'], fill=255)
    body &= ~(np.asarray(mask_img) > 0)
    body = grow(center, body)

# 边缘半透明：紧挨背景的一圈像素按与背景色的距离给 alpha，并做去溢色
edge = body & (
    np.roll(~body, 1, 0) | np.roll(~body, -1, 0) | np.roll(~body, 1, 1) | np.roll(~body, -1, 1)
)
alpha = body.astype(np.float32)
a_edge = np.clip(dist / 60.0, 0.15, 1.0)
alpha[edge] = a_edge[edge]
rgb = img.copy()
k = alpha[..., None]
rgb = np.where(edge[..., None], np.clip((img - bg * (1 - k)) / np.maximum(k, 1e-3), 0, 255), img)

out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
ys, xs = np.nonzero(alpha > 0)
out = out[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
im = Image.fromarray(out, 'RGBA')
im = im.resize((round(im.width * cfg['height'] / im.height), cfg['height']), Image.LANCZOS)
dst.parent.mkdir(parents=True, exist_ok=True)
im.save(dst, optimize=True)
print(f'{dst}  {im.size}  bbox(src)=x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}')

# 发间那朵花单独切一份（圆形羽化遮罩），思考 / 干活时叠在原位旋转——向 Claude 的转圈小星芒致敬
if cfg.get('flower'):
    (cx, cy), r = cfg['flower']
    flower = im.crop((cx - r, cy - r, cx + r, cy + r))
    yy, xx = np.mgrid[0 : 2 * r, 0 : 2 * r] + 0.5
    mask = np.clip((r - np.sqrt((xx - r) ** 2 + (yy - r) ** 2)) / 3.0, 0, 1)
    fa = np.asarray(flower).astype(np.float32)
    fa[..., 3] *= mask
    fdst = dst.with_name(f'{pose}-flower.png')
    Image.fromarray(fa.astype(np.uint8), 'RGBA').save(fdst, optimize=True)
    print(f'{fdst}  center={(cx, cy)} r={r}')

# 托盘 / 通知图标：取脸部方块
if cfg.get('icon'):
    icon = im.crop(cfg['icon']).resize((128, 128), Image.LANCZOS)
    idst = dst.with_name('icon.png')
    icon.save(idst, optimize=True)
    print(idst)
    # Windows 快捷方式 / 通知顶栏用的多尺寸 ico
    icon.save(idst.with_suffix('.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128)])

# 双腿拆层：身体去掉 cut 以下；左右腿各自一张同尺寸透明图，走路 / 跳跃时分别抬起
if cfg.get('legs'):
    L = cfg['legs']
    full = np.asarray(im).copy()
    body = full.copy()
    body[L['cut'] :, :, 3] = 0
    Image.fromarray(body, 'RGBA').save(dst.with_name(f'{pose}-body.png'), optimize=True)
    for side, xs in (('l', slice(0, L['split'])), ('r', slice(L['split'], None))):
        leg = np.zeros_like(full)
        top = L['cut'] - L['overlap']
        leg[top:, xs] = full[top:, xs]
        Image.fromarray(leg, 'RGBA').save(dst.with_name(f'{pose}-leg-{side}.png'), optimize=True)
    print('legs split', L)
