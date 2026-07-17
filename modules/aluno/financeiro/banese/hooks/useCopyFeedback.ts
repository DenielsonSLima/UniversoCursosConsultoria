import { useCallback, useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from '../../../../../lib/clipboard';

export type CopyFeedbackState = 'idle' | 'copied' | 'error';

const useCopyFeedback = (resetKey?: unknown) => {
  const [state, setState] = useState<CopyFeedbackState>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  useEffect(() => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    setState('idle');
  }, [resetKey]);

  const copy = useCallback(async (value: string) => {
    if (await copyTextToClipboard(value)) {
      setState('copied');
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setState('idle'), 2400);
      return true;
    }
    setState('error');
    return false;
  }, []);

  return { state, copy };
};

export default useCopyFeedback;
