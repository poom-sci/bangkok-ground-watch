"""Write the OpenAPI schema to docs/openapi.json (the API contract kept in git).

uv run siting-openapi            # regenerate
uv run siting-openapi --check    # exit 1 if docs/openapi.json is out of date (used by CI)
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

from .app import create_app

DEFAULT = Path("docs/openapi.json")


def schema() -> dict:
    with tempfile.TemporaryDirectory() as empty:  # the schema does not depend on any data
        return create_app(empty).openapi()


def render() -> str:
    return json.dumps(schema(), indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=DEFAULT)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    text = render()
    if a.check:
        if not a.out.exists() or a.out.read_text() != text:
            sys.exit(f"{a.out} is out of date: run `uv run siting-openapi`")
        print(f"{a.out} is up to date")
        return
    a.out.write_text(text)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
