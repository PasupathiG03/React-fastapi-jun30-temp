import logging
import time
from typing import Any, Dict
import requests

logger = logging.getLogger(__name__)


class ForexService:
    """
    Real-time USD to INR Foreign Exchange service with in-memory caching and resilient fallbacks.
    Provides live real-time rate conversion for Gemini AI token monitoring.
    """

    _cached_rate: float = 94.11
    _last_fetched: float = 0
    _ttl_seconds: int = 600  # 10 minute cache to respect rate limits
    _is_live: bool = False
    _source: str = "Real-time Forex Feed (open.er-api.com)"

    @classmethod
    def get_usd_to_inr(cls, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Fetches current live USD to INR exchange rate.
        Returns a dict with rate, currencies, timestamp, and live status.
        """
        now = time.time()
        if not force_refresh and (now - cls._last_fetched) < cls._ttl_seconds and cls._is_live:
            return {
                "rate": cls._cached_rate,
                "from_currency": "USD",
                "to_currency": "INR",
                "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cls._last_fetched)),
                "source": cls._source,
                "is_live": True,
            }

        # 1. Primary Live Feed: Open Exchange Rates API (free, reliable)
        try:
            resp = requests.get("https://open.er-api.com/v6/latest/USD", timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                inr = data.get("rates", {}).get("INR")
                if inr and isinstance(inr, (int, float)) and inr > 50:
                    cls._cached_rate = round(float(inr), 2)
                    cls._last_fetched = now
                    cls._is_live = True
                    cls._source = "Real-time Forex Feed (open.er-api.com)"
                    return {
                        "rate": cls._cached_rate,
                        "from_currency": "USD",
                        "to_currency": "INR",
                        "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cls._last_fetched)),
                        "source": cls._source,
                        "is_live": True,
                    }
        except Exception as e:
            logger.warning(f"Primary forex rate fetch error: {e}")

        # 2. Secondary Live Feed: ExchangeRate API
        try:
            resp = requests.get("https://api.exchangerate-api.com/v4/latest/USD", timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                inr = data.get("rates", {}).get("INR")
                if inr and isinstance(inr, (int, float)) and inr > 50:
                    cls._cached_rate = round(float(inr), 2)
                    cls._last_fetched = now
                    cls._is_live = True
                    cls._source = "Real-time Forex Feed (exchangerate-api.com)"
                    return {
                        "rate": cls._cached_rate,
                        "from_currency": "USD",
                        "to_currency": "INR",
                        "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cls._last_fetched)),
                        "source": cls._source,
                        "is_live": True,
                    }
        except Exception as e:
            logger.warning(f"Secondary forex rate fetch error: {e}")

        # 3. Fallback
        return {
            "rate": cls._cached_rate,
            "from_currency": "USD",
            "to_currency": "INR",
            "last_updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cls._last_fetched or now)),
            "source": cls._source,
            "is_live": cls._is_live,
        }

    @classmethod
    def convert_usd_to_inr(cls, amount_usd: float) -> float:
        """Converts USD amount to INR using the current live rate."""
        rate_info = cls.get_usd_to_inr()
        rate = rate_info["rate"]
        return round(amount_usd * rate, 5)

