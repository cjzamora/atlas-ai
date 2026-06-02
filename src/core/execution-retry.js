const DEFAULT_MAX_ATTEMPTS = 3;

export async function executeWithTransientRetries(executeAttempt, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS));
  const attempts = [];

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const result = await executeAttempt(attemptNumber);
    attempts.push({
      attemptNumber,
      ok: Boolean(result?.ok),
      status: result?.status || "failed",
      retryable: Boolean(result?.error?.retryable),
      errorCode: result?.error?.code || null
    });

    if (result?.ok || !result?.error?.retryable || attemptNumber === maxAttempts) {
      return {
        ...result,
        retry: {
          attemptCount: attemptNumber,
          retried: attemptNumber > 1,
          exhausted: !result?.ok && Boolean(result?.error?.retryable) && attemptNumber === maxAttempts,
          attempts
        }
      };
    }
  }

  return {
    ok: false,
    status: "failed",
    error: {
      code: "retry_loop_failed",
      message: "Retry loop exited unexpectedly.",
      retryable: false
    },
    retry: {
      attemptCount: attempts.length,
      retried: attempts.length > 1,
      exhausted: true,
      attempts
    }
  };
}
