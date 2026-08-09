const LOCAL_REQUEST_TTL_MS = 30_000;
const reconciledRequests = new Map<string, number>();

const pruneRequests = (now: number) => {
  reconciledRequests.forEach((expiresAt, requestId) => {
    if (expiresAt <= now) reconciledRequests.delete(requestId);
  });
};

export const markFinanceiroRequestReconciled = (
  requestId: string,
  now = Date.now(),
) => {
  pruneRequests(now);
  reconciledRequests.set(requestId, now + LOCAL_REQUEST_TTL_MS);
};

export const isFinanceiroRequestReconciled = (
  requestId: string,
  now = Date.now(),
) => {
  pruneRequests(now);
  return (reconciledRequests.get(requestId) || 0) > now;
};

