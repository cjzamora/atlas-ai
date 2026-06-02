"""A small time/clock abstraction used by the scheduler.

The scheduler depends on :class:`Clock` rather than ``time.monotonic`` directly
so tests can advance time deterministically with :class:`ManualClock`.
"""

import time
from typing import Protocol


class Clock(Protocol):
    """Anything that can report the current monotonic time in seconds."""

    def now(self) -> float:
        ...


class SystemClock:
    """A clock backed by the operating system monotonic timer."""

    def now(self) -> float:
        """Return the current monotonic time in seconds."""
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        """Block for ``seconds`` seconds."""
        if seconds > 0:
            time.sleep(seconds)


class ManualClock:
    """A controllable clock for deterministic tests."""

    def __init__(self, start: float = 0.0) -> None:
        self._t = float(start)

    def now(self) -> float:
        return self._t

    def sleep(self, seconds: float) -> None:
        """Advance the manual clock instead of actually sleeping."""
        self.advance(seconds)

    def advance(self, seconds: float) -> float:
        """Move the clock forward and return the new time."""
        self._t += float(seconds)
        return self._t
