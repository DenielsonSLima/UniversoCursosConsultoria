export const normalizePublicValidationCode = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, '');

export const resolvePublicValidationCodeFromSearchParams = (
  searchParams: Pick<URLSearchParams, 'get'>,
) => (
  normalizePublicValidationCode(searchParams.get('q') || '')
  || normalizePublicValidationCode(searchParams.get('code') || '')
);

export interface LatestValidationRequestGuard {
  activate: () => void;
  begin: () => number;
  cancel: () => void;
  canCommit: (requestId: number) => boolean;
  deactivate: () => void;
}

export const createLatestValidationRequestGuard =
  (): LatestValidationRequestGuard => {
    let active = false;
    let latestRequestId = 0;

    return {
      activate() {
        active = true;
      },
      begin() {
        latestRequestId += 1;
        return latestRequestId;
      },
      cancel() {
        latestRequestId += 1;
      },
      canCommit(requestId) {
        return active && requestId === latestRequestId;
      },
      deactivate() {
        active = false;
        latestRequestId += 1;
      },
    };
  };
