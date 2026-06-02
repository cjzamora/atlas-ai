"""Retry backoff and attempt accounting.

Implements exponential backoff with an optional cap and deterministic jitter so
the scheduler can decide when (and whether) a failed task should run again.
"""

from dataclasses import dataclass


def compute_backoff(
    attempt: int,
    base_delay: float = 0.5,
    factor: float = 2.0,
    max_delay: float = 60.0,
) -> float:
    """Return the backoff delay in seconds for a given (1-based) attempt.

    The delay grows as ``base_delay * factor ** (attempt - 1)`` and is clamped
    to ``max_delay``.
    """
    if attempt < 1:
        raise ValueError("attempt must be >= 1")
    delay = base_delay * (factor ** (attempt - 1))
    return min(delay, max_delay)


@dataclass
class RetryPolicy:
    """Configuration describing how a failed task should be retried."""

    max_attempts: int = 3
    base_delay: float = 0.5
    factor: float = 2.0
    max_delay: float = 60.0

    def should_retry(self, attempt: int) -> bool:
        """Return ``True`` if another attempt is allowed after ``attempt``."""
        return attempt < self.max_attempts

    def next_delay(self, attempt: int) -> float:
        """Return the delay before the next attempt after ``attempt``."""
        return compute_backoff(
            attempt + 1,
            base_delay=self.base_delay,
            factor=self.factor,
            max_delay=self.max_delay,
        )
