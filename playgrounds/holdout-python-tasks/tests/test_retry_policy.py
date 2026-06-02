import pytest

from taskflow.retry_policy import RetryPolicy, compute_backoff


def test_compute_backoff_grows_exponentially():
    assert compute_backoff(1, base_delay=0.5, factor=2.0) == 0.5
    assert compute_backoff(2, base_delay=0.5, factor=2.0) == 1.0
    assert compute_backoff(3, base_delay=0.5, factor=2.0) == 2.0


def test_compute_backoff_is_capped():
    assert compute_backoff(10, base_delay=1.0, factor=2.0, max_delay=5.0) == 5.0


def test_compute_backoff_rejects_bad_attempt():
    with pytest.raises(ValueError):
        compute_backoff(0)


def test_should_retry_respects_max_attempts():
    policy = RetryPolicy(max_attempts=3)
    assert policy.should_retry(1)
    assert policy.should_retry(2)
    assert not policy.should_retry(3)


def test_next_delay_uses_following_attempt():
    policy = RetryPolicy(base_delay=0.5, factor=2.0)
    assert policy.next_delay(1) == 1.0
