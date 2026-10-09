import { useEffect, useRef, useState } from 'react';
import { createCarteirinhasPdf, downloadCarteirinhasPdf, printCarteirinhas } from './secretaria-carteirinhas.pdf';

type PdfState = { key: string; url: string; blob: Blob | null; error: string };

export const useCarteirinhasPdf = (sourceKey: string, layoutType: 'dobra' | 'espelhado') => {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${attempt}:${sourceKey}`;
  const [state, setState] = useState<PdfState>({ key: '', url: '', blob: null, error: '' });
  const [printing, setPrinting] = useState(false);
  const [actionError, setActionError] = useState('');
  const current = state.key === key ? state : { key, url: '', blob: null, error: '' };

  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    const controller = new AbortController();
    let objectUrl = '';
    setActionError('');
    setState({ key, url: '', blob: null, error: '' });
    void createCarteirinhasPdf(source, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setState({ key, url: objectUrl, blob, error: '' });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({
        key, url: '', blob: null,
        error: error instanceof Error ? error.message : 'Não foi possível preparar as carteirinhas.',
      });
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  const download = () => {
    if (!current.blob) return;
    try {
      downloadCarteirinhasPdf(current.blob, layoutType);
      setActionError('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível baixar as carteirinhas.');
    }
  };
  const print = async () => {
    if (!current.blob || printing) return;
    setPrinting(true);
    setActionError('');
    try { await printCarteirinhas(current.blob); }
    catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível abrir a impressão.');
    } finally { setPrinting(false); }
  };

  return {
    sourceRef, url: current.url, error: current.error, actionError, printing,
    ready: Boolean(current.blob), download, print,
    retry: () => setAttempt((value) => value + 1), attempt,
  };
};
