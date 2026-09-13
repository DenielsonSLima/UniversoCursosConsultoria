import { supabase } from '../../../../../../../lib/supabase';
import { requireProescCycleReview } from './proesc-cycle-review.parser';

export const reviewProescCycles = async (matriculaId: string) => {
  const { data, error } = await supabase.functions.invoke('proesc-api', {
    body: { action: 'review_cycles', matriculaId },
  });
  if (error) {
    let message = 'Não foi possível conferir os ciclos no Proesc. Tente novamente.';
    if (error.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      if (typeof body?.error === 'string') message = body.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return requireProescCycleReview(data);
};
