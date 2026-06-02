from taskflow.clock import ManualClock
from taskflow.retry_policy import RetryPolicy
from taskflow.scheduler import Scheduler, ScheduledTask
from taskflow.worker import Worker


def test_run_once_executes_ready_task():
    sched = Scheduler(clock=ManualClock())
    seen = []
    sched.schedule(ScheduledTask(name="t", run=lambda: seen.append("ran")))
    worker = Worker(sched)
    task = worker.run_once()
    assert task.name == "t"
    assert seen == ["ran"]
    assert worker.processed == 1


def test_run_once_returns_none_when_empty():
    worker = Worker(Scheduler(clock=ManualClock()))
    assert worker.run_once() is None


def test_run_until_empty_drains_all_tasks():
    sched = Scheduler(clock=ManualClock())
    for i in range(3):
        sched.schedule(ScheduledTask(name=f"t{i}", run=lambda: None, priority=i))
    worker = Worker(sched)
    assert worker.run_until_empty() == 3
    assert worker.processed == 3


def test_failed_task_is_requeued():
    sched = Scheduler(clock=ManualClock(), retry_policy=RetryPolicy(max_attempts=2))

    def boom():
        raise RuntimeError("nope")

    sched.schedule(ScheduledTask(name="boom", run=boom))
    worker = Worker(sched)
    worker.run_once()
    assert worker.failed == 1
    assert len(sched) == 1
