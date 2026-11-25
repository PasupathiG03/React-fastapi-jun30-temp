import io
import logging

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"


def to_png_or_jpeg(image_bytes: bytes) -> tuple:
    """(bytes, mime type) in a format every consumer reads (browsers, Gemini).

    Uploads may be any format the image library opens (WEBP, AVIF, BMP, TIFF, GIF, PSD, ...). PNG and JPEG
    pass through untouched; anything else is converted to lossless PNG, so no quality is lost and the mime
    type always matches the bytes."""
    if image_bytes[:8] == PNG_SIGNATURE:
        return image_bytes, "image/png"
    if image_bytes[:3] == JPEG_SIGNATURE:
        return image_bytes, "image/jpeg"
    try:
        with Image.open(io.BytesIO(image_bytes)) as src:
            im = ImageOps.exif_transpose(src)
            if im.mode not in ("RGB", "RGBA", "L", "LA"):
                has_alpha = "A" in im.getbands() or "transparency" in im.info
                im = im.convert("RGBA" if has_alpha else "RGB")
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            return buf.getvalue(), "image/png"
    except Exception as conv_err:
        logger.warning(f"Could not convert image to PNG: {conv_err}")
        return image_bytes, "application/octet-stream"
