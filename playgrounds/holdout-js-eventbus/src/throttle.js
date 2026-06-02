// Throttle and debounce helpers for rate-limiting function calls.

// Invoke at most once per `waitMs`, dropping calls in the cooldown window.
export function throttle(fn, waitMs, { now = () => Date.now() } = {}) {
  let lastCall = 0;
  let lastResult;

  function throttled(...args) {
    const ts = now();
    if (ts - lastCall >= waitMs) {
      lastCall = ts;
      lastResult = fn.apply(this, args);
    }
    return lastResult;
  }

  throttled.reset = () => {
    lastCall = 0;
  };
  return throttled;
}

// Delay invocation until `waitMs` has elapsed since the last call.
export function debounce(fn, waitMs) {
  let timer = null;

  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, waitMs);
  }

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}
