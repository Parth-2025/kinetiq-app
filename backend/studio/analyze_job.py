"""Isolated entry point for heavyweight Studio video analysis."""
import json
import os
import sys
from pathlib import Path

from studio.analysis import analyze


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 3:
        return 2
    video, side, result_path = Path(args[0]), args[1], Path(args[2])
    # Publish atomically so the parent never reads a partial result.
    temporary = result_path.with_suffix(result_path.suffix + ".tmp")
    try:
        output = analyze(video, side)
        payload = json.dumps(output, allow_nan=False, separators=(",", ":"))
        temporary.write_text(payload, encoding="utf-8")
        os.replace(temporary, result_path)
        return 0
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
