export interface RemovableAuthStorage {
  removeItem(key: string): void;
}

export const buildSupabaseAuthStorageKey = (supabaseUrl: string) => {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token`;
};

export const clearSupabaseAuthStorage = (
  storage: RemovableAuthStorage,
  storageKey: string,
) => {
  try {
    storage.removeItem(storageKey);
    storage.removeItem(`${storageKey}-code-verifier`);
    storage.removeItem(`${storageKey}-user`);
    return true;
  } catch {
    return false;
  }
};
