# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml"]
# ///
"""Turn data/conditions/*.yaml into js/conditions.js, which the page loads.

Run after editing the YAML:  uv run tools/build_conditions.py
Check it is up to date:      uv run tools/build_conditions.py --check
"""
import json
import pathlib
import sys

import yaml

root = pathlib.Path(__file__).resolve().parent.parent
conditions = {}
for path in sorted((root / "data" / "conditions").glob("*.yaml")):
    conditions[path.stem] = yaml.safe_load(path.read_text())["conditions"]

header = (
    "'use strict';\n"
    "// Status conditions for each mode, keyed by the mode buttons' data-scenario.\n"
    "// Generated from data/conditions/*.yaml by tools/build_conditions.py; edit the YAML, then\n"
    "// run:  uv run tools/build_conditions.py\n"
)
body = "const CONDITIONS = " + json.dumps(conditions, indent=2, ensure_ascii=False) + ";\n"
target = root / "js" / "conditions.js"
if "--check" in sys.argv:
    current = target.read_text() == header + body
    print("js/conditions.js is up to date" if current else "js/conditions.js is out of date: run uv run tools/build_conditions.py")
    sys.exit(0 if current else 1)
target.write_text(header + body)
for name, items in conditions.items():
    print(f"{name}: {len(items)} conditions")
