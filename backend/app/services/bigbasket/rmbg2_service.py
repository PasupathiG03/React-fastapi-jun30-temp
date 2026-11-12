import io
import logging
import os
import threading
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)


class RMBG2Service:
    """
    Local background removal using BRIA RMBG-2.0 (briaai/RMBG-2.0).

    Supports both:
    - ONNX Runtime (`onnxruntime` + `huggingface_hub` + `numpy` + `PIL`), which runs
      natively on Windows even when PyTorch DLLs are blocked by Application Control.
    - PyTorch + Hugging Face Transformers (`torch` + `torchvision` + `transformers`).

    Never calls external Photoroom APIs automatically. Returns clear, actionable
    error messages when dependencies are missing, model loading fails, or inference
    fails so the UI can surface the error and let the user click "Rerun Background Removal".
    """

    DEFAULT_MODEL_ID = "briaai/RMBG-2.0"
    DEFAULT_ONNX_FILE = "onnx/model.onnx"
    INPUT_SIZE = (1024, 1024)

    _lock = threading.Lock()
    _backend: Optional[str] = None  # "torch" | "onnx"
    _model: Any = None
    _device: Optional[str] = None
    _transform: Any = None
    _onnx_session: Any = None
    _onnx_input_name: Optional[str] = None
    _load_error: Optional[str] = None

    @classmethod
    def _get_env_value(cls, key: str) -> str:
        val = (os.getenv(key) or "").strip()
        if val:
            return val
        # Also check project .env / backend/.env in case BaseSettings didn't export the key to os.environ
        from pathlib import Path
        service_dir = Path(__file__).resolve()
        for env_path in (
            service_dir.parents[3] / ".env",
            service_dir.parents[4] / ".env",
        ):
            if env_path.is_file():
                try:
                    for line in env_path.read_text(encoding="utf-8").splitlines():
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        if k.strip() == key:
                            return v.strip().strip('"').strip("'")
                except Exception:
                    pass
        return ""

    @classmethod
    def get_model_id(cls) -> str:
        return cls._get_env_value("RMBG2_MODEL_ID") or cls.DEFAULT_MODEL_ID

    @classmethod
    def get_onnx_file(cls) -> str:
        return cls._get_env_value("RMBG2_ONNX_FILE") or cls.DEFAULT_ONNX_FILE

    @classmethod
    def get_hf_token(cls) -> Optional[str]:
        token = cls._get_env_value("HF_TOKEN") or cls._get_env_value("HUGGINGFACE_HUB_TOKEN")
        return token or None

    @classmethod
    def get_model_cache_dir(cls) -> Optional[str]:
        cache_val = cls._get_env_value("MODEL_CACHE")
        if not cache_val:
            return None
        from pathlib import Path
        p = Path(cache_val)
        if not p.is_absolute():
            p = Path(__file__).resolve().parents[4] / p
        p.mkdir(parents=True, exist_ok=True)
        return str(p)

    @classmethod
    def reset_cache(cls) -> None:
        """Clears cached model state (primarily for testing)."""
        with cls._lock:
            cls._backend = None
            cls._model = None
            cls._device = None
            cls._transform = None
            cls._onnx_session = None
            cls._onnx_input_name = None
            cls._load_error = None

    @classmethod
    def _try_load_torch(cls) -> Tuple[bool, Optional[str]]:
        missing_pkgs = []
        load_issues = []
        for pkg_name, import_fn in (
            ("torch", lambda: __import__("torch")),
            ("torchvision", lambda: __import__("torchvision.transforms")),
            ("transformers", lambda: __import__("transformers")),
            ("pillow", lambda: __import__("PIL.Image")),
        ):
            try:
                import_fn()
            except ModuleNotFoundError:
                missing_pkgs.append(pkg_name)
            except Exception as exc:
                load_issues.append(f"{pkg_name}: {exc}")

        if missing_pkgs or load_issues:
            parts = []
            if missing_pkgs:
                parts.append(f"missing dependencies: {', '.join(missing_pkgs)}")
            if load_issues:
                parts.append(f"dependency load error ({'; '.join(load_issues)})")
            return False, " and ".join(parts)

        try:
            import torch
            from torchvision import transforms
            from transformers import AutoModelForImageSegmentation

            model_id = cls.get_model_id()
            hf_token = cls.get_hf_token()
            cache_dir = cls.get_model_cache_dir()
            device = "cuda" if torch.cuda.is_available() else "cpu"

            load_kwargs = {"trust_remote_code": True}
            if hf_token:
                load_kwargs["token"] = hf_token
            if cache_dir:
                load_kwargs["cache_dir"] = cache_dir

            logger.info(f"[RMBG-2.0] Loading PyTorch model '{model_id}' on device '{device}'...")
            model = AutoModelForImageSegmentation.from_pretrained(model_id, **load_kwargs)
            model.to(device)
            model.eval()

            transform = transforms.Compose([
                transforms.Resize(cls.INPUT_SIZE),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ])

            cls._backend = "torch"
            cls._model = model
            cls._device = device
            cls._transform = transform
            cls._load_error = None
            logger.info(f"[RMBG-2.0] PyTorch model '{model_id}' loaded successfully on '{device}'.")
            return True, None
        except Exception as exc:
            return False, f"model loading failed: {exc}"

    @classmethod
    def _try_load_onnx(cls) -> Tuple[bool, Optional[str]]:
        missing_pkgs = []
        load_issues = []
        for pkg_name, import_fn in (
            ("onnxruntime", lambda: __import__("onnxruntime")),
            ("huggingface_hub", lambda: __import__("huggingface_hub")),
            ("numpy", lambda: __import__("numpy")),
            ("pillow", lambda: __import__("PIL.Image")),
        ):
            try:
                import_fn()
            except ModuleNotFoundError:
                missing_pkgs.append(pkg_name)
            except Exception as exc:
                load_issues.append(f"{pkg_name}: {exc}")

        if missing_pkgs or load_issues:
            parts = []
            if missing_pkgs:
                parts.append(f"missing dependencies: {', '.join(missing_pkgs)}")
            if load_issues:
                parts.append(f"dependency load error ({'; '.join(load_issues)})")
            return False, " and ".join(parts)

        try:
            import onnxruntime as ort
            from huggingface_hub import hf_hub_download

            model_id = cls.get_model_id()
            onnx_file = cls.get_onnx_file()
            hf_token = cls.get_hf_token()
            cache_dir = cls.get_model_cache_dir()
            local_onnx_path = cls._get_env_value("RMBG2_ONNX_PATH")

            if local_onnx_path and os.path.isfile(local_onnx_path):
                model_path = local_onnx_path
            else:
                try:
                    model_path = hf_hub_download(
                        repo_id=model_id,
                        filename=onnx_file,
                        token=hf_token,
                        cache_dir=cache_dir,
                        local_files_only=True,
                    )
                except Exception:
                    logger.info(f"[RMBG-2.0] Downloading/loading ONNX model '{model_id}/{onnx_file}'...")
                    model_path = hf_hub_download(
                        repo_id=model_id,
                        filename=onnx_file,
                        token=hf_token,
                        cache_dir=cache_dir,
                    )

            available_providers = ort.get_available_providers()
            providers = (
                ["CUDAExecutionProvider", "CPUExecutionProvider"]
                if "CUDAExecutionProvider" in available_providers
                else ["CPUExecutionProvider"]
            )
            sess_options = ort.SessionOptions()
            sess_options.log_severity_level = 3  # Suppress harmless ONNX shape-merge warnings
            sess_options.enable_cpu_mem_arena = False  # Reduce peak RAM usage / avoid bad_alloc on Windows CPU
            sess_options.enable_mem_pattern = False
            session = ort.InferenceSession(model_path, sess_options=sess_options, providers=providers)
            input_name = session.get_inputs()[0].name

            cls._backend = "onnx"
            cls._onnx_session = session
            cls._onnx_input_name = input_name
            cls._load_error = None
            logger.info(f"[RMBG-2.0] ONNX model loaded successfully using {providers}.")
            return True, None
        except Exception as exc:
            return False, f"ONNX model loading failed: {exc}"

    @classmethod
    def _ensure_loaded(cls) -> Tuple[bool, Optional[str]]:
        """
        Lazily loads RMBG-2.0 once per process.
        Returns (True, None) on success, or (False, clear_error_message) on failure.
        """
        if cls._backend == "torch" and cls._model is not None and cls._transform is not None:
            return True, None
        if cls._backend == "onnx" and cls._onnx_session is not None:
            return True, None
        # Support pre-injected mock model in tests
        if cls._model is not None and cls._transform is not None:
            cls._backend = "torch"
            return True, None

        with cls._lock:
            if cls._backend == "torch" and cls._model is not None and cls._transform is not None:
                return True, None
            if cls._backend == "onnx" and cls._onnx_session is not None:
                return True, None

            preferred = (os.getenv("RMBG2_BACKEND") or "auto").strip().lower()
            errors = []

            if preferred in ("auto", "torch"):
                ok, torch_err = cls._try_load_torch()
                if ok:
                    return True, None
                if torch_err:
                    errors.append(f"PyTorch ({torch_err})")

            if preferred in ("auto", "onnx"):
                ok, onnx_err = cls._try_load_onnx()
                if ok:
                    return True, None
                if onnx_err:
                    errors.append(f"ONNX Runtime ({onnx_err})")

            err = (
                f"Local RMBG-2.0 background removal failed: {'; '.join(errors)}. "
                f"Click 'Rerun Background Removal' to use Photoroom."
            )
            cls._load_error = err
            logger.error(f"[RMBG-2.0] {err}")
            return False, err

    @staticmethod
    def _guided_filter(guide: Any, src: Any, radius: int = 4, eps: float = 1e-3) -> Any:
        import cv2
        ksize = (2 * radius + 1, 2 * radius + 1)
        mean_i = cv2.boxFilter(guide, cv2.CV_32F, ksize)
        mean_p = cv2.boxFilter(src, cv2.CV_32F, ksize)
        corr_i = cv2.boxFilter(guide * guide, cv2.CV_32F, ksize)
        corr_ip = cv2.boxFilter(guide * src, cv2.CV_32F, ksize)

        import numpy as np
        var_i = np.maximum(corr_i - mean_i * mean_i, 0.0)
        cov_ip = corr_ip - mean_i * mean_p

        a = cov_ip / (var_i + eps)
        b = mean_p - a * mean_i

        mean_a = cv2.boxFilter(a, cv2.CV_32F, ksize)
        mean_b = cv2.boxFilter(b, cv2.CV_32F, ksize)
        return mean_a * guide + mean_b

    @classmethod
    def _refine_alpha(cls, alpha: Any, guide: Any) -> Any:
        import cv2
        import numpy as np
        from PIL import Image

        src = np.asarray(alpha.convert("L"), dtype=np.float32) / 255.0
        guide_gray = cv2.cvtColor(np.asarray(guide.convert("RGB")), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
        if guide_gray.shape != src.shape:
            guide_gray = cv2.resize(guide_gray, (src.shape[1], src.shape[0]), interpolation=cv2.INTER_LINEAR)
        guided = cls._guided_filter(guide_gray, src, radius=4, eps=1e-3)
        edge_weight = 4.0 * src * (1.0 - src)
        result = src * (1.0 - 0.65 * edge_weight) + guided * (0.65 * edge_weight)
        return Image.fromarray(np.clip(result * 255.0, 0, 255).astype(np.uint8), "L")

    @staticmethod
    def _decontaminate_edges(rgb: Any, alpha: Any) -> Any:
        import cv2
        import numpy as np

        a = alpha.astype(np.float32) / 255.0
        rgb_f = rgb.astype(np.float32)
        fg_mask = (a >= 0.95).astype(np.float32)
        if not fg_mask.any():
            return rgb

        sigma = max(2.0, min(rgb.shape[:2]) * 0.003)
        weight = cv2.GaussianBlur(fg_mask, (0, 0), sigmaX=sigma)
        fg_sum = cv2.GaussianBlur(rgb_f * fg_mask[..., None], (0, 0), sigmaX=sigma)

        valid = weight > 1e-4
        fg_est = np.where(valid[..., None], fg_sum / np.maximum(weight[..., None], 1e-4), rgb_f)

        edge_blend = np.clip((0.95 - a) / 0.95, 0.0, 1.0) * (a > 0).astype(np.float32) * valid.astype(np.float32)
        out = rgb_f * (1.0 - edge_blend[..., None]) + fg_est * edge_blend[..., None]
        out[a <= 0.0] = 0.0
        return np.clip(out, 0, 255).astype(np.uint8)

    @classmethod
    def _compose_refined_rgba(cls, pil_img: Any, mask: Any) -> bytes:
        import numpy as np
        from PIL import Image

        refined_alpha = cls._refine_alpha(mask, guide=pil_img)
        alpha_arr = np.asarray(refined_alpha).copy()
        # Snap near-zero background haze (< ~8% opacity) to pure transparent so faint
        # white-on-white background residuals don't form a visible gray box or break bbox cropping.
        alpha_arr[alpha_arr < 20] = 0
        clean_rgb = cls._decontaminate_edges(np.asarray(pil_img), alpha_arr)
        rgba = np.dstack((clean_rgb, alpha_arr))
        out_img = Image.fromarray(rgba.astype(np.uint8), "RGBA")
        out_buf = io.BytesIO()
        out_img.save(out_buf, format="PNG")
        return out_buf.getvalue()

    @classmethod
    def _run_torch_inference(cls, image_bytes: bytes) -> bytes:
        import torch
        from torchvision import transforms
        from PIL import Image, ImageOps

        pil_img = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
        orig_size = pil_img.size

        input_tensor = cls._transform(pil_img).unsqueeze(0).to(cls._device)
        with torch.inference_mode():
            preds = cls._model(input_tensor)[-1].sigmoid().cpu()

        pred = preds[0].squeeze()
        mask = transforms.ToPILImage()(pred).resize(orig_size, Image.Resampling.BILINEAR)
        return cls._compose_refined_rgba(pil_img, mask)

    @classmethod
    def _run_onnx_inference(cls, image_bytes: bytes) -> bytes:
        import numpy as np
        from PIL import Image, ImageOps

        pil_img = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
        orig_size = pil_img.size

        resized = pil_img.resize(cls.INPUT_SIZE, Image.Resampling.BILINEAR)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        arr = (arr - mean) / std
        input_tensor = np.transpose(arr, (2, 0, 1))[None, ...]

        outputs = cls._onnx_session.run(None, {cls._onnx_input_name: input_tensor})
        pred = np.asarray(outputs[-1], dtype=np.float32).squeeze()

        # Apply sigmoid if output is raw logits
        if pred.min() < 0.0 or pred.max() > 1.0:
            pred = 1.0 / (1.0 + np.exp(-np.clip(pred, -88.0, 88.0)))

        mask_u8 = np.clip(pred * 255.0, 0, 255).astype(np.uint8)
        mask = Image.fromarray(mask_u8, mode="L").resize(orig_size, Image.Resampling.BILINEAR)
        return cls._compose_refined_rgba(pil_img, mask)

    @classmethod
    def remove_background_with_status(
        cls,
        image_bytes: bytes,
    ) -> Tuple[Optional[bytes], Optional[str]]:
        """
        Removes the image background locally using RMBG-2.0.

        Returns:
            (rgba_png_bytes, None) on success, or
            (None, error_message) on dependency, model-loading, or inference failure.
        """
        ok, load_err = cls._ensure_loaded()
        if not ok:
            return None, load_err

        try:
            if cls._backend == "onnx":
                return cls._run_onnx_inference(image_bytes), None
            return cls._run_torch_inference(image_bytes), None
        except Exception as exc:
            err = (
                f"Local RMBG-2.0 inference failed: {exc}. "
                f"Click 'Rerun Background Removal' to use Photoroom."
            )
            logger.exception(f"[RMBG-2.0] {err}")
            return None, err

    @classmethod
    def remove_background(cls, image_bytes: bytes) -> Optional[bytes]:
        """Convenience wrapper returning RGBA PNG bytes on success, or None on failure."""
        png_bytes, _ = cls.remove_background_with_status(image_bytes)
        return png_bytes
