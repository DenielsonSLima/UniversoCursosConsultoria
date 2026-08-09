export const snapshotFirst = (
  snapshot: Record<string, any>,
  key: string,
  legacyValue: unknown,
) => Object.prototype.hasOwnProperty.call(snapshot, key)
  ? snapshot[key]
  : legacyValue;
