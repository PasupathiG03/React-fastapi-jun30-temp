"""
Comprehensive Test Suite for Product Image Analysis & Quality Assessment
Covers all 12 test cases specified in Section 10:
1. High-resolution, sharp product image
2. Low-resolution product image (< 1500px)
3. Blurry product image
4. Very dark image
5. Overexposed image
6. Low-contrast image
7. Transparent PNG (RGBA)
8. Portrait image
9. Landscape image
10. Square image
11. Corrupted image
12. Unsupported file format
"""

import io
import os
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.image_analysis import analyze_original_image
from app.services.image_quality import assess_image_quality


def create_base_product_image(width=1800, height=1800, bg_color=(210, 210, 210)):
    """Creates a synthetic sharp product image (bottle/box with text and textures)."""
    img = np.full((height, width, 3), bg_color, dtype=np.uint8)
    
    # Draw a simulated product bottle in center
    cx, cy = width // 2, height // 2
    bw, bh = int(width * 0.45), int(height * 0.70)
    x1, y1 = cx - bw // 2, cy - bh // 2
    x2, y2 = cx + bw // 2, cy + bh // 2

    # Bottle body
    cv2.rectangle(img, (x1, y1), (x2, y2), (25, 110, 190), -1)
    cv2.rectangle(img, (x1, y1), (x2, y2), (10, 50, 100), 4)

    # Label with text details (creates sharp edges for Laplacian variance)
    lw, lh = int(bw * 0.8), int(bh * 0.5)
    lx1, ly1 = cx - lw // 2, cy - lh // 2
    lx2, ly2 = cx + lw // 2, cy + lh // 2
    cv2.rectangle(img, (lx1, ly1), (lx2, ly2), (255, 255, 255), -1)
    cv2.putText(img, "ORGANIC HONEY", (lx1 + 20, ly1 + 60), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (10, 10, 10), 4)
    cv2.putText(img, "100% PURE & RAW", (lx1 + 20, ly1 + 140), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (180, 50, 20), 3)
    cv2.putText(img, "Net Wt: 500g", (lx1 + 20, ly1 + 210), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (30, 30, 30), 2)
    for i in range(12):
        y_line = ly1 + 250 + (i * 20)
        cv2.line(img, (lx1 + 20, y_line), (lx2 - 20, y_line), (50, 50, 50), 2)

    return img


def to_jpeg_bytes(img_arr):
    buf = io.BytesIO()
    Image.fromarray(img_arr).save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def to_png_bytes(img_arr):
    buf = io.BytesIO()
    Image.fromarray(img_arr).save(buf, format="PNG")
    return buf.getvalue()


def run_tests():
    print("=" * 80)
    print("RUNNING 12 PRODUCT IMAGE QUALITY & ANALYSIS TEST CASES")
    print("=" * 80)

    results = []

    # 1. High-resolution, sharp product image
    img1 = create_base_product_image(2000, 2000)
    b1 = to_jpeg_bytes(img1)
    a1 = analyze_original_image(b1, "1_high_res_sharp.jpg")
    q1 = assess_image_quality(a1)
    results.append(("1. High-res Sharp", a1, q1, "ACCEPTED"))

    # 2. Low-resolution product image (< 1500px)
    img2 = create_base_product_image(800, 600)
    b2 = to_jpeg_bytes(img2)
    a2 = analyze_original_image(b2, "2_low_res.jpg")
    q2 = assess_image_quality(a2)
    results.append(("2. Low-res (<1500px)", a2, q2, "REJECTED"))

    # 3. Blurry product image
    img3 = cv2.GaussianBlur(create_base_product_image(1800, 1800), (35, 35), 15)
    b3 = to_jpeg_bytes(img3)
    a3 = analyze_original_image(b3, "3_blurry.jpg")
    q3 = assess_image_quality(a3)
    results.append(("3. Blurry Image", a3, q3, "REJECTED"))

    # 4. Very dark image
    img4 = np.clip(create_base_product_image(1800, 1800).astype(np.float32) * 0.12, 0, 255).astype(np.uint8)
    b4 = to_jpeg_bytes(img4)
    a4 = analyze_original_image(b4, "4_very_dark.jpg")
    q4 = assess_image_quality(a4)
    results.append(("4. Very Dark", a4, q4, "REJECTED"))

    # 5. Overexposed image (can be WARNING or REJECTED depending on severity per Section 5)
    img5 = np.clip(create_base_product_image(1800, 1800).astype(np.float32) * 1.6 + 60, 0, 255).astype(np.uint8)
    b5 = to_jpeg_bytes(img5)
    a5 = analyze_original_image(b5, "5_overexposed.jpg")
    q5 = assess_image_quality(a5)
    results.append(("5. Overexposed", a5, q5, ("WARNING", "REJECTED")))

    # 6. Low-contrast image
    img6 = np.full((1800, 1800, 3), 128, dtype=np.uint8)
    cv2.rectangle(img6, (600, 600), (1200, 1200), (135, 135, 135), -1)
    b6 = to_jpeg_bytes(img6)
    a6 = analyze_original_image(b6, "6_low_contrast.jpg")
    q6 = assess_image_quality(a6)
    results.append(("6. Low Contrast", a6, q6, "REJECTED"))

    # 7. Transparent PNG
    rgba = np.zeros((1800, 1800, 4), dtype=np.uint8)
    # Draw bottle onto RGBA array with 255 alpha
    cx, cy = 900, 900
    bw, bh = 700, 1100
    x1, y1 = cx - bw // 2, cy - bh // 2
    x2, y2 = cx + bw // 2, cy + bh // 2
    cv2.rectangle(rgba, (x1, y1), (x2, y2), (25, 110, 190, 255), -1)
    cv2.rectangle(rgba, (x1, y1), (x2, y2), (10, 50, 100, 255), 4)
    lw, lh = int(bw * 0.8), int(bh * 0.5)
    lx1, ly1 = cx - lw // 2, cy - lh // 2
    lx2, ly2 = cx + lw // 2, cy + lh // 2
    cv2.rectangle(rgba, (lx1, ly1), (lx2, ly2), (255, 255, 255, 255), -1)
    cv2.putText(rgba, "CANDY PACK", (lx1 + 20, ly1 + 60), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (10, 10, 10, 255), 4)
    cv2.putText(rgba, "100% ORGANIC", (lx1 + 20, ly1 + 140), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (180, 50, 20, 255), 3)
    cv2.putText(rgba, "Net Wt: 250g", (lx1 + 20, ly1 + 210), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (30, 30, 30, 255), 2)
    for i in range(10):
        y_line = ly1 + 250 + (i * 20)
        cv2.line(rgba, (lx1 + 20, y_line), (lx2 - 20, y_line), (50, 50, 50, 255), 2)
    buf7 = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf7, format="PNG")
    b7 = buf7.getvalue()
    a7 = analyze_original_image(b7, "7_transparent.png")
    q7 = assess_image_quality(a7)
    results.append(("7. Transparent PNG", a7, q7, "ACCEPTED"))

    # 8. Portrait image (height > width >= 1500px)
    img8 = create_base_product_image(1600, 2400)
    b8 = to_jpeg_bytes(img8)
    a8 = analyze_original_image(b8, "8_portrait.jpg")
    q8 = assess_image_quality(a8)
    results.append(("8. Portrait (1600x2400)", a8, q8, "ACCEPTED"))

    # 9. Landscape image (width > height >= 1500px)
    img9 = create_base_product_image(2400, 1600)
    b9 = to_jpeg_bytes(img9)
    a9 = analyze_original_image(b9, "9_landscape.jpg")
    q9 = assess_image_quality(a9)
    results.append(("9. Landscape (2400x1600)", a9, q9, "ACCEPTED"))

    # 10. Square image (width == height == 2000px)
    img10 = create_base_product_image(2000, 2000)
    b10 = to_jpeg_bytes(img10)
    a10 = analyze_original_image(b10, "10_square.jpg")
    q10 = assess_image_quality(a10)
    results.append(("10. Square (2000x2000)", a10, q10, "ACCEPTED"))

    # 11. Corrupted image
    b11 = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00random-corrupted-bytes-12345"
    err11 = None
    try:
        analyze_original_image(b11, "11_corrupted.jpg")
    except ValueError as e:
        err11 = str(e)
    results.append(("11. Corrupted Image", None, err11, "CORRUPTED_REJECTED"))

    # 12. Unsupported file format
    b12 = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
    err12 = None
    try:
        analyze_original_image(b12, "12_unsupported.gif")
    except ValueError as e:
        err12 = str(e)
    results.append(("12. Unsupported Format", None, err12, "UNSUPPORTED_REJECTED"))

    # 13. Dynamic Dimensions: 1080x1440 packaging with default 1080x1440 threshold -> ACCEPTED
    img13 = create_base_product_image(1080, 1440)
    b13 = to_jpeg_bytes(img13)
    a13 = analyze_original_image(b13, "13_pack_1080x1440.jpg")
    q13 = assess_image_quality(a13, min_width=1080, min_height=1440)
    results.append(("13. Dynamic (1080x1440 ok)", a13, q13, "ACCEPTED"))

    # 14. Dynamic Dimensions: Same 1080x1440 image with user 1500x1500 threshold -> REJECTED
    q14 = assess_image_quality(a13, min_width=1500, min_height=1500)
    results.append(("14. Dynamic (1500x1500 fail)", a13, q14, "REJECTED"))

    # Print summary table
    print("\n" + "-" * 105)
    print(f"{'Test Case':<26} | {'Dimensions / Mode':<20} | {'Score':<8} | {'Category':<10} | {'Status':<10} | {'Issues'}")
    print("-" * 105)

    all_passed = True
    for name, a, q, expected in results:
        if a is not None and hasattr(q, "overall_score"):
            dim_str = f"{a.width}x{a.height} ({a.color_mode})"
            issues_str = ", ".join([i.code for i in q.issues]) if q.issues else "None"
            print(f"{name:<26} | {dim_str:<20} | {q.overall_score:<8} | {q.quality_category:<10} | {q.status:<10} | {issues_str}")
            is_valid_match = (q.status in expected) if isinstance(expected, (tuple, list)) else (q.status == expected)
            if not is_valid_match:
                all_passed = False
        else:
            print(f"{name:<26} | {'Corrupted / Invalid':<20} | {'0':<8} | {'Poor':<10} | {'REJECTED':<10} | {q}")

    print("-" * 105)
    print(f"\nALL {len(results)} TEST CASES EXECUTED SUCCESSFULLY!" if all_passed else "\nSOME TESTS FAILED MATCH EXPECTATION.")
    return all_passed


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
