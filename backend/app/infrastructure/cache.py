"""Redis cache integration for rate limiting, sessions, and caching."""
import os
import json
import time
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)

# Attempt to import redis, fall back to in-memory if not available
try:
    import redis as redis_lib
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("Redis not installed. Using in-memory fallback for caching.")


class CacheBackend:
    """Abstract cache backend interface."""

    def get(self, key: str) -> Optional[str]:
        raise NotImplementedError

    def set(self, key: str, value: str, ttl: int = 0) -> None:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError

    def incr(self, key: str) -> int:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError


class RedisCache(CacheBackend):
    """Redis-based cache backend."""

    def __init__(self, host: str = "localhost", port: int = 6379, db: int = 0):
        self.client = redis_lib.Redis(host=host, port=port, db=db, decode_responses=True)
        # Test connection
        try:
            self.client.ping()
            logger.info("Redis connected successfully at %s:%d", host, port)
        except redis_lib.ConnectionError:
            logger.warning("Redis connection failed at %s:%d. Using in-memory fallback.", host, port)
            raise

    def get(self, key: str) -> Optional[str]:
        return self.client.get(key)

    def set(self, key: str, value: str, ttl: int = 0) -> None:
        if ttl > 0:
            self.client.setex(key, ttl, value)
        else:
            self.client.set(key, value)

    def delete(self, key: str) -> None:
        self.client.delete(key)

    def incr(self, key: str) -> int:
        return self.client.incr(key)

    def exists(self, key: str) -> bool:
        return bool(self.client.exists(key))


class MemoryCache(CacheBackend):
    """In-memory fallback cache backend."""

    def __init__(self):
        self._store: dict[str, tuple[str, float]] = {}
        logger.info("Using in-memory cache backend")

    def _is_expired(self, key: str) -> bool:
        if key not in self._store:
            return True
        _, expiry = self._store[key]
        return 0 < expiry < time.time()

    def _cleanup(self) -> None:
        now = time.time()
        expired = [k for k, (_, e) in self._store.items() if 0 < e < now]
        for k in expired:
            del self._store[k]

    def get(self, key: str) -> Optional[str]:
        self._cleanup()
        if key in self._store and not self._is_expired(key):
            return self._store[key][0]
        return None

    def set(self, key: str, value: str, ttl: int = 0) -> None:
        expiry = time.time() + ttl if ttl > 0 else 0
        self._store[key] = (value, expiry)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def incr(self, key: str) -> int:
        val = self.get(key)
        if val is None:
            self.set(key, "1", 60)
            return 1
        new_val = int(val) + 1
        self.set(key, str(new_val), 60)
        return new_val

    def exists(self, key: str) -> bool:
        return key in self._store and not self._is_expired(key)


# Singleton cache instance
_cache: Optional[CacheBackend] = None


def get_cache() -> CacheBackend:
    """Get or initialize cache backend."""
    global _cache
    if _cache is not None:
        return _cache

    # Try Redis first
    if REDIS_AVAILABLE:
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", 6379))
        try:
            _cache = RedisCache(host=redis_host, port=redis_port)
            return _cache
        except Exception:
            pass

    # Fallback to in-memory
    _cache = MemoryCache()
    return _cache


# Convenience functions
def cache_get(key: str) -> Optional[str]:
    return get_cache().get(key)


def cache_set(key: str, value: str, ttl: int = 300) -> None:
    get_cache().set(key, value, ttl)


def cache_delete(key: str) -> None:
    get_cache().delete(key)


def cache_incr(key: str) -> int:
    return get_cache().incr(key)


def cache_exists(key: str) -> bool:
    return get_cache().exists(key)


# Rate limiter using cache
def is_rate_limited(key: str, limit: int = 10, period: int = 60) -> bool:
    """Check if a key has exceeded the rate limit using cache backend."""
    now = int(time.time())
    window_key = f"ratelimit:{key}:{now // period}"
    
    # Use counter approach
    count = cache_incr(window_key)
    
    # Set TTL on first increment
    if count == 1:
        cache_set(window_key, str(count), period * 2)
    
    return count > limit


# Session store using cache
def cache_session(token: str, user_id: int, role: str, ttl: int = 86400) -> None:
    """Cache session data for fast lookup."""
    session_data = json.dumps({"user_id": user_id, "role": role})
    cache_set(f"session:{token}", session_data, ttl)


def get_cached_session(token: str) -> Optional[dict]:
    """Get cached session data."""
    data = cache_get(f"session:{token}")
    if data:
        return json.loads(data)
    return None


def delete_cached_session(token: str) -> None:
    """Delete cached session."""
    cache_delete(f"session:{token}")