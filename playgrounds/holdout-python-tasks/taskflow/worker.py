"""A worker that pulls tasks from a scheduler and executes them.

The worker repeatedly asks the :class:`~taskflow.scheduler.Scheduler` for the
next ready task, runs it, and on failure asks the scheduler to requeue it.
"""

from typing import Optional

from taskflow.scheduler import Scheduler, ScheduledTask


class Worker:
    """Drives a scheduler by executing ready tasks one at a time."""

    def __init__(self, scheduler: Scheduler) -> None:
        self._scheduler = scheduler
        self.processed = 0
        self.failed = 0

    def run_once(self) -> Optional[ScheduledTask]:
        """Pull and execute a single ready task; return it, or ``None``."""
        task = self._scheduler.next_ready()
        if task is None:
            return None
        self._execute(task)
        return task

    def run_until_empty(self, max_iterations: int = 1000) -> int:
        """Drain ready tasks until none remain; return the count processed."""
        count = 0
        for _ in range(max_iterations):
            task = self.run_once()
            if task is None:
                break
            count += 1
        return count

    def _execute(self, task: ScheduledTask) -> None:
        """Run a task's callable, requeueing it on failure."""
        try:
            task.run()
            self.processed += 1
        except Exception:
            self.failed += 1
            self._scheduler.reschedule_failure(task)
