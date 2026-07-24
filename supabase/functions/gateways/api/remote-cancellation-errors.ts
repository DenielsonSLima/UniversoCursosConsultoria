export class RemoteCancellationPreflightError extends Error {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = "RemoteCancellationPreflightError";
  }
}

export const remoteCancellationErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
