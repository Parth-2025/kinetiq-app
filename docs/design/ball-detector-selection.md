# Experimental sports ball detector

The experimental adapter uses the official Megvii-BaseDetection YOLOX-Nano COCO ONNX release `0.1.1rc0`, artifact `yolox_nano.onnx`, with fixed 416×416 input. The upstream ONNX Runtime README lists Nano at 416×416 and links this release artifact. The upstream demo preprocessing creates a 114-valued canvas, resizes by the minimum aspect-preserving ratio, places the resized BGR image at the top left, transposes to CHW float32, and performs no normalization. Its inference path calls `demo_postprocess`, forms scores as objectness times each class score, and rescales boxes by the resize ratio. The adapter follows that standard raw-head decode and selects COCO class 32 (`sports ball`). It returns up to eight normalized original-frame boxes after score filtering, clipping, finite/positive-area validation, and NMS.

`score` is the model's raw objectness × class score. It is not a calibrated probability. The experimental candidate floor is 0.05 before NMS (NMS IoU threshold 0.45). This generic COCO model is not fine-tuned for a particular sport, ball, camera, or video domain.

The detector loads only a caller-provided local model and fails clearly if it is absent, has a different SHA-256, or cannot be loaded by OpenCV DNN. It does not download at request time. To download the pinned artifact explicitly:

```sh
cd backend
.venv/bin/python -m studio.download_ball_model
```

The default cache path is `~/.cache/kinetiq/yolox_nano.onnx`, controlled by `KINETIQ_MODEL_CACHE_DIR`; `--dest PATH` overrides it. The worker looks in the configured cache directory. The downloader enforces a 10,000,000-byte maximum and verifies SHA-256 before atomically installing the file.

Pinned artifact SHA-256:

```text
c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d
```

## Licensing and provenance

The YOLOX repository declares Apache-2.0 for its code. That code license alone does not establish the licensing terms for the separately released ONNX weights or the COCO training data. The upstream project identifies COCO evaluation/training and distributes pretrained weights, but the artifact page does not provide a distinct, clearly stated model/data license. Treat the weight and data rights as requiring separate review; this selection is not blanket commercial-use clearance.

Sources: [YOLOX repository and license](https://github.com/Megvii-BaseDetection/YOLOX), [ONNX Runtime README and Nano release link](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/demo/ONNXRuntime/README.md), [official ONNX inference script](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/demo/ONNXRuntime/onnx_inference.py), [official preprocessing implementation](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/yolox/data/data_augment.py), [official COCO class ordering](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/yolox/data/datasets/coco_classes.py).
