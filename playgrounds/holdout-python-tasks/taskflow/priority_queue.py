"""A binary-heap priority queue.

Smaller priority values are popped first (min-heap). Insertion order is used as
a tie-breaker so the queue is stable for equal priorities.
"""

from itertools import count
from typing import Any, List, Tuple


class QueueEmptyError(Exception):
    """Raised when popping or peeking an empty queue."""


class PriorityQueue:
    """A min-heap priority queue backed by a Python list."""

    def __init__(self) -> None:
        self._heap: List[Tuple[float, int, Any]] = []
        self._counter = count()

    def __len__(self) -> int:
        return len(self._heap)

    def is_empty(self) -> bool:
        return not self._heap

    def push(self, item: Any, priority: float) -> None:
        """Insert ``item`` with the given numeric ``priority``."""
        entry = (priority, next(self._counter), item)
        self._heap.append(entry)
        self._sift_up(len(self._heap) - 1)

    def pop(self) -> Any:
        """Remove and return the lowest-priority item."""
        if not self._heap:
            raise QueueEmptyError("pop from an empty priority queue")
        last = self._heap.pop()
        if self._heap:
            self._heap[0], head = last, self._heap[0]
            self._sift_down(0)
            return head[2]
        return last[2]

    def peek(self) -> Any:
        """Return the lowest-priority item without removing it."""
        if not self._heap:
            raise QueueEmptyError("peek from an empty priority queue")
        return self._heap[0][2]

    def _sift_up(self, idx: int) -> None:
        heap = self._heap
        while idx > 0:
            parent = (idx - 1) // 2
            if heap[idx][:2] < heap[parent][:2]:
                heap[idx], heap[parent] = heap[parent], heap[idx]
                idx = parent
            else:
                break

    def _sift_down(self, idx: int) -> None:
        heap = self._heap
        size = len(heap)
        while True:
            smallest = idx
            for child in (2 * idx + 1, 2 * idx + 2):
                if child < size and heap[child][:2] < heap[smallest][:2]:
                    smallest = child
            if smallest == idx:
                break
            heap[idx], heap[smallest] = heap[smallest], heap[idx]
            idx = smallest
