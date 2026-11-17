"""Shared values for the backend tests.

In the app these come only from the database (Image Automation > Settings); the code has no built-in values.
Tests run without that database row, so they pass these explicitly.
"""

# Output preset copied into a batch's config (canvas size, DPI, FOP/BOP padding).
TEST_PRESET = {
    "canvas_width": 2000,
    "canvas_height": 2000,
    "dpi": 150,
    "fop_bop_padding": {"top": 180, "bottom": 180, "left": 100, "right": 100},
}

# Minimum upload resolution used by the image quality checks.
TEST_MIN_WIDTH = 1500
TEST_MIN_HEIGHT = 1500
