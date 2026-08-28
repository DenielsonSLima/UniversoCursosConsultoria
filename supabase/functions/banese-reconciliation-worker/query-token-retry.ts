import { classifyBaneseReconciliationError } from "./error-classification.ts";

export const createLazyAsyncValue = <T>(load: () => Promise<T>) => {
  let current: Promise<T> | null = null;
  return {
    get: () => current ??= load(),
    reset: () => {
      current = null;
    },
  };
};

export const queryWithSingleBaneseAuthRetry = async <T>(input: {
  query: () => Promise<T>;
  renew: () => Promise<void>;
  deferredError?: (result: T) => unknown;
}) => {
  let result: T;
  try {
    result = await input.query();
  } catch (error) {
    if (classifyBaneseReconciliationError(error).errorClass !== "AUTH") {
      throw error;
    }
    await input.renew();
    return await input.query();
  }

  const deferredError = input.deferredError?.(result);
  if (
    deferredError &&
    classifyBaneseReconciliationError(deferredError).errorClass === "AUTH"
  ) {
    await input.renew();
    return await input.query();
  }
  return result;
};
