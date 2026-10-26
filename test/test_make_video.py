"""make_video.py 纯计算部分的单测（不需要 ffmpeg）：python test/test_make_video.py"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
import make_video as mv  # noqa: E402


def green_frame(w=320, h=180):
    f = np.zeros((h, w, 3), np.uint8)
    f[:] = (0, 255, 0)
    return f


class ChromaKeyTest(unittest.TestCase):
    def test_green_is_transparent_and_character_colors_survive(self):
        f = green_frame()
        f[50:150, 100:140] = (240, 120, 40)   # 橙发
        f[60:80, 150:170] = (255, 255, 255)   # 白裙
        f[90:100, 150:170] = (40, 60, 200)    # 蓝色
        f[110:120, 150:170] = (20, 20, 20)    # 黑鞋
        out = mv.chroma_key(f)
        self.assertEqual(out[5, 5, 3], 0)
        for y, x in [(60, 110), (70, 160), (95, 160), (115, 160)]:
            self.assertEqual(out[y, x, 3], 255, (y, x))

    def test_watermark_box_is_keyed_out(self):
        f = green_frame()
        f[170:178, 290:318] = (200, 200, 200)  # 右下角灰色水印字
        out = mv.chroma_key(mv.paint_watermark(f, mv.DEFAULT_WATERMARK))
        self.assertIsNone(mv.content_box(out))


class LayoutTest(unittest.TestCase):
    def test_standing_figure_lands_on_shared_layout(self):
        f = green_frame(1280, 720)
        f[100:600, 500:700] = (240, 120, 40)  # 人物：高 500，脚底 y=599，中心 x=599.5
        rgba = mv.chroma_key(f)
        layout = mv.standing_layout([mv.content_box(rgba)])
        x0, y0, x1, y1 = mv.content_box(mv.place(rgba, layout))
        self.assertAlmostEqual(y1 - y0, mv.STAND_RATIO * mv.OUT_H, delta=2)
        self.assertAlmostEqual(y1, mv.FEET_RATIO * mv.OUT_H, delta=2)
        self.assertAlmostEqual((x0 + x1) / 2, mv.OUT_W / 2, delta=2)

    def test_feet_anchor_on_the_grounded_frame_even_if_she_starts_moving(self):
        # 第 1 帧站地（脚底 599），之后几帧已经起跳；脚底仍应对齐到站地那一帧
        boxes = [(500, 100, 699, 599), (500, 80, 699, 579), (500, 60, 699, 559)]
        layout = mv.standing_layout(boxes)
        self.assertAlmostEqual(599 * layout['scale'] + layout['dy'], mv.FEET_RATIO * mv.OUT_H, delta=0.01)

    def test_standing_falls_back_to_tail_when_video_opens_zoomed_in(self):
        zoomed = (300, 50, 900, 719)          # 贴底：脚出画
        normal = (540, 144, 740, 612)
        boxes = [zoomed] * 5 + [normal] * 20 + [normal] * 5
        self.assertEqual(mv.pick_standing(boxes), [normal] * 5)

    def test_camera_zoom_trims_transitions_to_the_dominant_size(self):
        # 0.5 秒推近 → 主体放大保持 → 结尾拉回：保留放大的主体段
        hs = [400, 420, 500] + [600] * 30 + [500, 410, 400]
        ratio, i0, i1 = mv.camera_zoom(hs)
        self.assertGreater(ratio, 1.25)
        self.assertEqual((i0, i1), (3, 33))
        # 举手让身高变化 10%：不是推拉，不剪
        self.assertEqual(mv.camera_zoom([400] * 10 + [440] * 5 + [400] * 10)[1:], (0, 25))

    def test_body_box_ignores_floating_effects(self):
        rgba = np.zeros((720, 1280, 4), np.uint8)
        rgba[200:600, 560:720, 3] = 255   # 角色
        rgba[20:60, 100:300, 3] = 255     # 头顶飘的彩带
        x0, y0, x1, y1 = mv.body_box(rgba)
        self.assertTrue(195 <= y0 <= 200 and 599 <= y1 <= 603 and 556 <= x0 <= 560, (x0, y0, x1, y1))

    def test_place_crops_instead_of_failing_when_out_of_bounds(self):
        rgba = mv.chroma_key(green_frame(1280, 720))
        rgba[:, :, 3] = 255
        out = mv.place(rgba, {'scale': 1.0, 'dx': -100, 'dy': -50})
        self.assertEqual(out.shape, (mv.OUT_H, mv.OUT_W, 4))
        self.assertTrue((out[..., 3] == 255).all())


if __name__ == '__main__':
    unittest.main()
