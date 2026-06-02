from taskflow.clock import ManualClock
from taskflow.retry_policy import RetryPolicy
from taskflow.scheduler import Scheduler, ScheduledTask


def make_task(name, priority=0.0):
    return ScheduledTask(name=name, run=lambda: None, priority=priority)


def test_next_ready_orders_by_priority():
    sched = Scheduler(clock=ManualClock())
    sched.schedule(make_task("low", priority=10))
    sched.schedule(make_task("high", priority=1))
    assert sched.next_ready().name == "high"
    assert sched.next_ready().name == "low"


def test_task_not_ready_before_run_at():
    clock = ManualClock(start=0.0)
    sched = Scheduler(clock=clock)
    sched.schedule(make_task("later"), delay=5.0)
    assert sched.next_ready() is None
    clock.advance(5.0)
    assert sched.next_ready().name == "later"


def test_next_ready_empty_returns_none():
    sched = Scheduler(clock=ManualClock())
    assert sched.next_ready() is None


def test_reschedule_failure_requeues_until_limit():
    sched = Scheduler(clock=ManualClock(), retry_policy=RetryPolicy(max_attempts=2))
    task = make_task("flaky")
    assert sched.reschedule_failure(task) is True
    assert sched.reschedule_failure(task) is False
