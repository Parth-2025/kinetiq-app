"""Explicitly download the pinned YOLOX-Nano ONNX model into the local cache."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
from urllib.request import urlopen

from studio.ball_detector import MODEL_SHA256, MODEL_URL
from settings import settings

MAX_BYTES = 10_000_000
DEFAULT_PATH = settings.model_cache_dir / "yolox_nano.onnx"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", type=Path, default=DEFAULT_PATH, help=f"model destination (default: {DEFAULT_PATH})")
    args = parser.parse_args()
    args.dest = args.dest.expanduser()
    args.dest.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.dest.with_name(args.dest.name + ".part")
    digest = hashlib.sha256()
    total = 0
    try:
        with urlopen(MODEL_URL, timeout=30) as response, temporary.open("wb") as output:
            length = response.headers.get("Content-Length")
            if length and int(length) > MAX_BYTES:
                raise ValueError(f"model exceeds {MAX_BYTES} byte download limit")
            while chunk := response.read(64 * 1024):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError(f"model exceeds {MAX_BYTES} byte download limit")
                digest.update(chunk)
                output.write(chunk)
        actual = digest.hexdigest()
        if actual != MODEL_SHA256:
            raise ValueError(f"download SHA-256 mismatch: expected {MODEL_SHA256}, got {actual}")
        os.replace(temporary, args.dest)
        print(f"Downloaded verified YOLOX-Nano model to {args.dest} ({total} bytes, sha256 {actual})")
    finally:
        temporary.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
