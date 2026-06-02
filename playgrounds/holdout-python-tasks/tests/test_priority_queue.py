import pytest

from taskflow.priority_queue import PriorityQueue, QueueEmptyError


def test_push_pop_orders_by_priority():
    q = PriorityQueue()
    q.push("low", 10)
    q.push("high", 1)
    q.push("mid", 5)
    assert q.pop() == "high"
    assert q.pop() == "mid"
    assert q.pop() == "low"


def test_peek_does_not_remove():
    q = PriorityQueue()
    q.push("a", 3)
    q.push("b", 1)
    assert q.peek() == "b"
    assert len(q) == 2


def test_stable_for_equal_priority():
    q = PriorityQueue()
    q.push("first", 1)
    q.push("second", 1)
    assert q.pop() == "first"
    assert q.pop() == "second"


def test_pop_empty_raises():
    q = PriorityQueue()
    assert q.is_empty()
    with pytest.raises(QueueEmptyError):
        q.pop()


def test_peek_empty_raises():
    q = PriorityQueue()
    with pytest.raises(QueueEmptyError):
        q.peek()
