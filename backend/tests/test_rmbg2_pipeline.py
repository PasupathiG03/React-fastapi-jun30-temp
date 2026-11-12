import io
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.bigbasket.pipeline import ImageProcessingPipeline
from app.services.bigbasket.rmbg2_service import RMBG2Service


def _make_sample_jpeg_bytes(width: int = 400, height: int = 400) -> bytes:
    img = np.full((height, width, 3), (240, 240, 240), dtype=np.uint8)
    img[100:300, 100:300] = (30, 120, 200)
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def _make_sample_rgba_png_bytes(width: int = 400, height: int = 400) -> bytes:
    rgba = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for x in range(100, 300):
        for y in range(100, 300):
            rgba.putpixel((x, y), (30, 120, 200, 255))
    buf = io.BytesIO()
    rgba.save(buf, format="PNG")
    return buf.getvalue()


class TestRMBG2Pipeline(unittest.TestCase):
    def setUp(self):
        RMBG2Service.reset_cache()
        self.sample_jpg = _make_sample_jpeg_bytes()

    def test_missing_dependencies_no_photoroom_fallback(self):
        with patch.object(
            RMBG2Service,
            "remove_background_with_status",
            return_value=(
                None,
                "Local RMBG-2.0 background removal failed due to missing dependencies: transformers. "
                "Install them or click 'Rerun Background Removal' to use Photoroom.",
            ),
        ), patch(
            "app.services.bigbasket.pipeline.PhotoroomService.remove_background"
        ) as mock_photoroom:
            result = ImageProcessingPipeline.process_image(
                image_bytes=self.sample_jpg,
                image_type="fop",
                config={"product_category": "FOOD"},
                auto_inpaint_mrp=False,
            )

        mock_photoroom.assert_not_called()
        self.assertFalse(result["photoroom_called"])
        self.assertEqual(result["bg_provider"], "rmbg2")
        self.assertFalse(result["has_transparency"])
        self.assertEqual(result["status"], "needs_review")
        self.assertIn("missing dependencies: transformers", result["bg_removal_error"])
        self.assertTrue(
            any("missing dependencies: transformers" in r for r in result["validation"]["failure_reasons"])
        )

    def test_real_rmbg2_missing_transformers_returns_clear_error(self):
        # Verify clear error message when both torch and onnx backends fail
        with patch.object(
            RMBG2Service,
            "_try_load_torch",
            return_value=(False, "missing dependencies: transformers"),
        ), patch.object(
            RMBG2Service,
            "_try_load_onnx",
            return_value=(False, "ONNX model loading failed: offline"),
        ):
            RMBG2Service.reset_cache()
            png_bytes, err = RMBG2Service.remove_background_with_status(self.sample_jpg)

        self.assertIsNone(png_bytes)
        self.assertIsNotNone(err)
        self.assertIn("missing dependencies", err)
        self.assertIn("Rerun Background Removal", err)

    def test_onnx_fallback_succeeds_when_torch_blocked(self):
        fake_session = MagicMock()
        fake_session.get_inputs.return_value = [MagicMock(name="input")]
        fake_session.run.return_value = [np.ones((1, 1, 1024, 1024), dtype=np.float32)]

        with patch.object(
            RMBG2Service,
            "_try_load_torch",
            return_value=(False, "dependency load error (torch: WinError 4551)"),
        ), patch(
            "huggingface_hub.hf_hub_download",
            return_value="dummy.onnx",
        ), patch(
            "onnxruntime.InferenceSession",
            return_value=fake_session,
        ), patch(
            "app.services.bigbasket.pipeline.PhotoroomService.remove_background"
        ) as mock_photoroom:
            RMBG2Service.reset_cache()
            result = ImageProcessingPipeline.process_image(
                image_bytes=self.sample_jpg,
                image_type="fop",
                config={"product_category": "FOOD"},
                auto_inpaint_mrp=False,
            )

        mock_photoroom.assert_not_called()
        self.assertFalse(result["photoroom_called"])
        self.assertEqual(result["bg_provider"], "rmbg2")
        self.assertTrue(result["has_transparency"])

    def test_model_loading_error_returns_clear_error_no_fallback(self):
        fake_torch = MagicMock()
        fake_torch.cuda.is_available.return_value = False
        fake_torchvision = MagicMock()
        fake_transformers = MagicMock()
        fake_transformers.AutoModelForImageSegmentation.from_pretrained.side_effect = RuntimeError(
            "401 Client Error: Unauthorized for url"
        )
        with patch.dict(
            sys.modules,
            {
                "torch": fake_torch,
                "torchvision": fake_torchvision,
                "torchvision.transforms": fake_torchvision.transforms,
                "transformers": fake_transformers,
            },
        ), patch.object(
            RMBG2Service,
            "_try_load_onnx",
            return_value=(False, "ONNX model loading failed: 401"),
        ), patch(
            "app.services.bigbasket.pipeline.PhotoroomService.remove_background"
        ) as mock_photoroom:
            RMBG2Service.reset_cache()
            result = ImageProcessingPipeline.process_image(
                image_bytes=self.sample_jpg,
                image_type="fop",
                config={"product_category": "FOOD"},
                auto_inpaint_mrp=False,
            )

        mock_photoroom.assert_not_called()
        self.assertFalse(result["photoroom_called"])
        self.assertEqual(result["bg_provider"], "rmbg2")
        self.assertFalse(result["has_transparency"])
        self.assertIn("model loading failed", result["bg_removal_error"])

    def test_inference_error_returns_clear_error_no_fallback(self):
        fake_torch = MagicMock()
        fake_torchvision = MagicMock()
        RMBG2Service._model = MagicMock(side_effect=RuntimeError("CUDA out of memory"))
        RMBG2Service._transform = MagicMock(return_value=MagicMock())
        RMBG2Service._device = "cpu"

        with patch.dict(
            sys.modules,
            {
                "torch": fake_torch,
                "torchvision": fake_torchvision,
                "torchvision.transforms": fake_torchvision.transforms,
            },
        ), patch(
            "app.services.bigbasket.pipeline.PhotoroomService.remove_background"
        ) as mock_photoroom:
            result = ImageProcessingPipeline.process_image(
                image_bytes=self.sample_jpg,
                image_type="fop",
                config={"product_category": "FOOD"},
                auto_inpaint_mrp=False,
            )

        mock_photoroom.assert_not_called()
        self.assertFalse(result["photoroom_called"])
        self.assertFalse(result["has_transparency"])
        self.assertIn("CUDA out of memory", result["bg_removal_error"])

    def test_rmbg2_success_skips_photoroom(self):
        rgba_png = _make_sample_rgba_png_bytes()
        with patch.object(
            RMBG2Service,
            "remove_background_with_status",
            return_value=(rgba_png, None),
        ), patch(
            "app.services.bigbasket.pipeline.PhotoroomService.remove_background"
        ) as mock_photoroom:
            result = ImageProcessingPipeline.process_image(
                image_bytes=self.sample_jpg,
                image_type="fop",
                config={"product_category": "FOOD"},
                auto_inpaint_mrp=False,
            )

        mock_photoroom.assert_not_called()
        self.assertFalse(result["photoroom_called"])
        self.assertEqual(result["bg_provider"], "rmbg2")
        self.assertTrue(result["has_transparency"])
        self.assertIsNone(result["bg_removal_error"])

    def test_explicit_photoroom_rerun_calls_photoroom(self):
        rgba_png = _make_sample_rgba_png_bytes()
        with patch.object(
            RMBG2Service,
            "remove_background_with_status",
        ) as mock_rmbg2, patch(
            "app.services.bigbasket.pipeline.PhotoroomService.remove_background",
            return_value=rgba_png,
        ) as mock_photoroom:
            result = ImageProcessingPipeline.process_image(
                image_bytes=self.sample_jpg,
                image_type="fop",
                config={"product_category": "FOOD", "bg_removal_provider": "photoroom"},
                auto_inpaint_mrp=False,
            )

        mock_rmbg2.assert_not_called()
        mock_photoroom.assert_called_once()
        self.assertTrue(result["photoroom_called"])
        self.assertEqual(result["bg_provider"], "photoroom")
        self.assertTrue(result["has_transparency"])


if __name__ == "__main__":
    unittest.main()
