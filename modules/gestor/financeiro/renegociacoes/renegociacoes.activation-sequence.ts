import type { ActivateRenegociacaoInput, RenegociacaoActivationProgress, RenegociacaoActivationResult } from './renegociacoes.activation';

/** Continue a confirmed batch, never retry an ambiguous banking response. */
export const runActivationSequence = async ({ input, invoke, onProgress, shouldContinue, initial, maxRounds = 32 }: {
  input: ActivateRenegociacaoInput;
  invoke: (input: ActivateRenegociacaoInput) => Promise<RenegociacaoActivationResult>;
  onProgress: (result: RenegociacaoActivationResult) => void;
  shouldContinue: () => boolean;
  initial?: RenegociacaoActivationProgress | null;
  maxRounds?: number;
}) => {
  let previous = initial;
  for (let round = 0; round < maxRounds && shouldContinue(); round += 1) {
    const result = await invoke(input);
    onProgress(result);
    if (result.state === 'ACTIVE' || result.state === 'REVIEW_REQUIRED' || !result.retryable || result.code) return result;
    if (previous && previous.state === result.state && previous.sourcesCanceled === result.sourcesCanceled
      && previous.replacementsIssued === result.replacementsIssued) return result;
    previous = result;
  }
  return previous;
};
