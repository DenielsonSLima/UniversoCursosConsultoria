import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { StudentCardPdfMode, StudentCardPdfOptions } from '../../shared/pdf/student-card';

const buildStudentCardPdf = async (source: HTMLElement, mode: StudentCardPdfMode, options: StudentCardPdfOptions) =>
  (await import('../../shared/pdf/student-card')).buildStudentCardPdf(source, mode, options);

/** Each mode keeps its original Blob for preview, download and printing. */
export function useStudentCardPdf(source: RefObject<HTMLDivElement | null>, renderKey: string, enabled: boolean) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNumber, setRetryNumber] = useState(0);
  const generationKey = `${retryNumber}:${renderKey}`;
  const [a4Blob, setA4Blob] = useState<Blob | null>(null);
  const [a4Preparing, setA4Preparing] = useState(false);
  const [a4Error, setA4Error] = useState<string | null>(null);
  const a4Promise = useRef<Promise<Blob> | null>(null);
  const generation = useRef(0);
  const readyKey = useRef('');
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    generation.current += 1;
    readyKey.current = '';
    setBlob(null); setError(null); setA4Blob(null); setA4Error(null); setA4Preparing(false);
    a4Promise.current = null;
    if (!enabled || !source.current) { setPreparing(false); return () => controller.abort(); }
    setPreparing(true);
    void buildStudentCardPdf(source.current, 'digital', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { readyKey.current = generationKey; setBlob(result); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Não foi possível preparar a carteirinha.'); })
      .finally(() => { if (!controller.signal.aborted) setPreparing(false); });
    return () => controller.abort();
  }, [enabled, generationKey, source]);

  const prepareA4 = useCallback(async () => {
    if (!source.current || !blob) return;
    if (a4Blob) return;
    const currentGeneration = generation.current;
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted) return;
    setA4Preparing(true); setA4Error(null);
    if (!a4Promise.current) a4Promise.current = buildStudentCardPdf(source.current, 'a4', { signal: controller.signal });
    try {
      const result = await a4Promise.current;
      if (generation.current === currentGeneration && !controller.signal.aborted) setA4Blob(result);
    } catch (failure) {
      if (generation.current !== currentGeneration || controller.signal.aborted) return;
      a4Promise.current = null;
      setA4Error(failure instanceof Error ? failure.message : 'Não foi possível preparar a impressão.');
    } finally {
      if (generation.current === currentGeneration && !controller.signal.aborted) setA4Preparing(false);
    }
  }, [a4Blob, blob, source]);

  const current = readyKey.current === generationKey;
  return { blob: current ? blob : null, preparing, error, revision: retryNumber, retry: () => setRetryNumber(value => value + 1),
    a4Blob: current ? a4Blob : null, a4Preparing, a4Error, prepareA4 };
}
