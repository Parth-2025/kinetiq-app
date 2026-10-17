"""OpenCV DNN adapter for the official YOLOX-Nano COCO ONNX export."""
from __future__ import annotations

import hashlib
from pathlib import Path

import cv2
import numpy as np

MODEL_SHA256 = "c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d"
MODEL_URL = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx"
INPUT_SIZE = (416, 416)  # height, width
SPORTSBALL_CLASS = 32  # COCO's "sports ball"
MAX_DETECTIONS = 8


def preprocess_bgr(frame: np.ndarray, input_size: tuple[int, int] = INPUT_SIZE) -> tuple[np.ndarray, float]:
    """YOLOX ValTransform: top-left BGR114 letterbox, CHW float32, no normalization."""
    if not isinstance(frame, np.ndarray) or frame.ndim != 3 or frame.shape[2] != 3:
        raise ValueError("frame must be an HxWx3 BGR numpy array")
    height, width = frame.shape[:2]
    if height <= 0 or width <= 0:
        raise ValueError("frame dimensions must be positive")
    ih, iw = input_size
    ratio = min(ih / height, iw / width)
    resized = cv2.resize(frame, (max(1, int(width * ratio)), max(1, int(height * ratio))), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((ih, iw, 3), 114, dtype=np.uint8)
    canvas[: resized.shape[0], : resized.shape[1]] = resized
    return np.ascontiguousarray(canvas.transpose(2, 0, 1), dtype=np.float32), ratio


def decode_yolox(output: np.ndarray, input_size: tuple[int, int] = INPUT_SIZE) -> np.ndarray:
    """Decode standard (not decode_in_inference) YOLOX output to xywh + scores."""
    out = np.asarray(output)
    if out.ndim == 3 and out.shape[0] == 1:
        out = out[0]
    if out.ndim != 2 or out.shape[1] != 85 or not np.isfinite(out).all():
        raise ValueError(f"unexpected YOLOX output shape or non-finite values: {out.shape}")
    h, w = input_size
    grids, strides = [], []
    for stride in (8, 16, 32):
        gh, gw = h // stride, w // stride
        yy, xx = np.meshgrid(np.arange(gh), np.arange(gw), indexing="ij")
        grids.append(np.stack((xx, yy), axis=-1).reshape(-1, 2))
        strides.append(np.full((gh * gw, 1), stride))
    grid, stride = np.concatenate(grids), np.concatenate(strides)
    if out.shape[0] != len(grid):
        raise ValueError(f"unexpected YOLOX candidate count {out.shape[0]}, expected {len(grid)}")
    decoded = out.astype(np.float32, copy=True)
    decoded[:, :2] = (decoded[:, :2] + grid) * stride
    try:
        with np.errstate(over="raise", invalid="raise"):
            decoded[:, 2:4] = np.exp(decoded[:, 2:4]) * stride
    except FloatingPointError as exc:
        raise ValueError("invalid YOLOX box dimensions") from exc
    return decoded


def _nms(boxes: np.ndarray, scores: np.ndarray, threshold: float) -> list[int]:
    if not len(boxes):
        return []
    xywh = boxes.copy()
    xywh[:, 2:] -= xywh[:, :2]
    indices = cv2.dnn.NMSBoxes(xywh.tolist(), scores.tolist(), 0.0, threshold)
    return np.asarray(indices).reshape(-1).astype(int).tolist() if len(indices) else []


class BallDetector:
    def __init__(self, model_path: Path, expected_sha256: str = MODEL_SHA256):
        self.model_path = Path(model_path).expanduser()
        if not self.model_path.is_file():
            raise ValueError(f"YOLOX-Nano ONNX model is missing at {self.model_path}; run backend/studio/download_ball_model.py")
        digest = hashlib.sha256(self.model_path.read_bytes()).hexdigest()
        if digest.lower() != expected_sha256.lower():
            raise ValueError(f"YOLOX-Nano model SHA-256 mismatch at {self.model_path}: expected {expected_sha256}, got {digest}")
        try:
            self._net = cv2.dnn.readNetFromONNX(str(self.model_path))
        except cv2.error as exc:
            raise ValueError(f"OpenCV could not load YOLOX-Nano ONNX model at {self.model_path}: {exc}") from exc
        self.metadata = {
            "model": "YOLOX-Nano COCO ONNX (0.1.1rc0)", "version": "0.1.1rc0", "sha256": digest,
            "input_resolution": [416, 416], "license_source": "YOLOX code Apache-2.0; weights/data licensing requires separate review",
            "score_threshold": 0.05, "nms_iou_threshold": 0.45, "max_detections": MAX_DETECTIONS,
            "score_semantics": "raw model objectness × sports-ball class score; not a calibrated probability",
            "source": MODEL_URL,
        }

    def detect(self, bgr_frame: np.ndarray) -> list[dict]:
        tensor, ratio = preprocess_bgr(bgr_frame)
        try:
            self._net.setInput(tensor[None, ...])
            raw = self._net.forward()
        except cv2.error as exc:
            raise ValueError(f"OpenCV YOLOX-Nano inference failed: {exc}") from exc
        pred = decode_yolox(raw)
        scores = pred[:, 4] * pred[:, 5 + SPORTSBALL_CLASS]
        finite = np.isfinite(scores) & np.isfinite(pred[:, :4]).all(axis=1)
        boxes = pred[finite, :4]
        scores = scores[finite]
        # Experimental floor for candidate retrieval; scores are not calibrated probabilities.
        keep = scores >= 0.05
        boxes, scores = boxes[keep], scores[keep]
        if not len(boxes):
            return []
        xyxy = np.column_stack((boxes[:, 0] - boxes[:, 2] / 2, boxes[:, 1] - boxes[:, 3] / 2,
                                boxes[:, 0] + boxes[:, 2] / 2, boxes[:, 1] + boxes[:, 3] / 2)) / ratio
        h, w = bgr_frame.shape[:2]
        xyxy[:, [0, 2]] = np.clip(xyxy[:, [0, 2]], 0, w)
        xyxy[:, [1, 3]] = np.clip(xyxy[:, [1, 3]], 0, h)
        valid = np.isfinite(xyxy).all(axis=1) & (xyxy[:, 2] > xyxy[:, 0]) & (xyxy[:, 3] > xyxy[:, 1])
        xyxy, scores = xyxy[valid], scores[valid]
        kept = _nms(xyxy, scores, 0.45)
        kept = sorted(kept, key=lambda i: float(scores[i]), reverse=True)[:MAX_DETECTIONS]
        return [{"bbox": [float(xyxy[i, 0] / w), float(xyxy[i, 1] / h),
                           float(xyxy[i, 2] / w), float(xyxy[i, 3] / h)], "score": float(scores[i])} for i in kept]
