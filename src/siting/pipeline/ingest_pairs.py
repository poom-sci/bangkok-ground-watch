"""Fetch VV+VH for specific Sentinel-1 dates (any orbit), used to calibrate the water rule.

    python -m siting.pipeline.ingest_pairs --raw raw/hatyai --bbox 100.35 6.90 100.60 7.12 --date 2025-11-23
"""
from .ingest import main_pairs

if __name__ == "__main__":
    main_pairs()
