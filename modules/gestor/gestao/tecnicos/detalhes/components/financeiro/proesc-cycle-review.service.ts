import { supabase } from '../../../../../../../lib/supabase';
import { requireProescCycleReview } from './proesc-cycle-review.parser';
import type { ProescClassCycleReview } from './proesc-cycle-review.query';

export const reviewProescClassCycles = async (turmaId: string): Promise<ProescClassCycleReview> => {
  const { data, error } = await supabase.functions.invoke('proesc-api', {
    body: { action: 'review_class_cycles', turmaId },
  });
  if (error) throw new Error('Não foi possível concluir a conferência automática no Proesc.');
  if (!data || typeof data.success !== 'boolean' || data.turmaId !== turmaId
    || !Number.isInteger(data.reviewed) || data.reviewed < 0
    || (data.failed !== undefined && (!Number.isInteger(data.failed) || data.failed < 0))) {
    throw new Error('O Proesc não confirmou a conferência automática da turma.');
  }
  return data as ProescClassCycleReview;
};

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
