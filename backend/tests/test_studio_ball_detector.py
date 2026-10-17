import numpy as np
import pytest

from studio.ball_detector import decode_yolox, preprocess_bgr


def test_preprocess_uses_bgr114_top_left_letterbox_and_no_normalization():
    frame = np.zeros((100, 200, 3), dtype=np.uint8)
    frame[:, :, 0] = 255  # B channel makes channel order visible
    tensor, ratio = preprocess_bgr(frame)
    assert ratio == pytest.approx(2.08)
    assert tensor.shape == (3, 416, 416)
    assert tensor.dtype == np.float32
    assert tensor[0, 0, 0] == 255
    assert tensor[1, 0, 0] == 0
    assert tensor[:, 300, 300].tolist() == [114, 114, 114]


def test_decode_yolox_decodes_first_grid_location_and_rejects_bad_shape():
    raw = np.zeros((1, 3549, 85), dtype=np.float32)
    raw[0, 0, :4] = [0.5, 0.25, 0.0, 0.0]
    decoded = decode_yolox(raw)
    assert decoded[0, :4].tolist() == pytest.approx([4, 2, 8, 8])
    with pytest.raises(ValueError, match="unexpected YOLOX"):
        decode_yolox(np.zeros((1, 100, 85), dtype=np.float32))


def test_preprocess_rejects_non_bgr_frame():
    with pytest.raises(ValueError, match="HxWx3 BGR"):
        preprocess_bgr(np.zeros((20, 20), dtype=np.uint8))
