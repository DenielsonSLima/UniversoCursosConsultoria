import { useEffect, useState, type RefObject } from 'react';

/** Never expose a previous student's/model's PDF while the next generation loads. */
export function useInternshipBadgePdf(source: RefObject<HTMLDivElement | null>, renderKey: string, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const generationKey = `${revision}:${renderKey}`;
  const [state, setState] = useState<{ key: string; blob: Blob | null; error: string | null }>({
    key: '', blob: null, error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    if (!enabled || !source.current) return () => controller.abort();
    const root = source.current;
    void import('../../shared/pdf/student-card').then(({ buildInternshipBadgePdf }) =>
      buildInternshipBadgePdf(root, { signal: controller.signal }),
    ).then(blob => {
      if (!controller.signal.aborted) setState({ key: generationKey, blob, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key: generationKey, blob: null,
        error: error instanceof Error ? error.message : 'Não foi possível preparar o crachá.' });
    });
    return () => controller.abort();
  }, [enabled, generationKey, source]);

  const current = enabled && state.key === generationKey;
  return {
    blob: current ? state.blob : null,
    error: current ? state.error : null,
    preparing: enabled && !current,
    revision,
    retry: () => setRevision(value => value + 1),
  };
}
