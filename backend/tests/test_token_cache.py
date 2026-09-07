from auth.dependency import AUTH_CACHE_TTL, _TokenCache


def test_token_cache_ttl_and_eviction(monkeypatch):
    cache = _TokenCache()
    now = [1000.0]
    monkeypatch.setattr("auth.dependency.time.monotonic", lambda: now[0])
    cache.put("tok", {"sub": "auth0|1"})
    assert cache.get("tok") == {"sub": "auth0|1"}
    now[0] += AUTH_CACHE_TTL + 1
    assert cache.get("tok") is None  # expired -> evicted
