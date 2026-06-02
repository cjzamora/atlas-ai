"""Schedules tasks by priority and ready time.

Combines a :class:`~taskflow.priority_queue.PriorityQueue` (ordered by
priority) with a :class:`~taskflow.clock.Clock` so tasks only become eligible
once their ``run_at`` time has arrived. Failed tasks are requeued according to
a :class:`~taskflow.retry_policy.RetryPolicy`.
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from taskflow.clock import Clock, SystemClock
from taskflow.priority_queue import PriorityQueue, QueueEmptyError
from taskflow.retry_policy import RetryPolicy


@dataclass
class ScheduledTask:
    """A unit of work tracked by the scheduler."""

    name: str
    run: Callable[[], Any]
    priority: float = 0.0
    run_at: float = 0.0
    attempt: int = 0


class Scheduler:
    """Order tasks by priority and release them when their time has come."""

    def __init__(self, clock: Optional[Clock] = None,
                 retry_policy: Optional[RetryPolicy] = None) -> None:
        self._clock = clock or SystemClock()
        self._retry_policy = retry_policy or RetryPolicy()
        self._queue: PriorityQueue = PriorityQueue()

    def __len__(self) -> int:
        return len(self._queue)

    def schedule(self, task: ScheduledTask, delay: float = 0.0) -> None:
        """Enqueue ``task`` to become ready after ``delay`` seconds."""
        task.run_at = self._clock.now() + delay
        self._queue.push(task, task.priority)

    def next_ready(self) -> Optional[ScheduledTask]:
        """Pop the highest-priority task that is ready to run, else ``None``."""
        if self._queue.is_empty():
            return None
        candidate: ScheduledTask = self._queue.peek()
        if candidate.run_at > self._clock.now():
            return None
        try:
            return self._queue.pop()
        except QueueEmptyError:
            return None

    def reschedule_failure(self, task: ScheduledTask) -> bool:
        """Requeue ``task`` after a failure if the retry policy allows it."""
        task.attempt += 1
        if not self._retry_policy.should_retry(task.attempt):
            return False
        self.schedule(task, delay=self._retry_policy.next_delay(task.attempt))
        return True
