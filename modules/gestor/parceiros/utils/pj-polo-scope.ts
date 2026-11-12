import { MATRIZ_POLO_ID } from './parceiros.constants.ts';

export const defaultPjScope = (poloId?: string | null, canManage = false) =>
  canManage && poloId === MATRIZ_POLO_ID ? 'all' : 'active';

export function pjPoloSelection(ids: string[], preferred?: string | null) {
  const poloIds = [...new Set(ids.filter(Boolean))];
  if (!poloIds.length) throw new Error('Selecione pelo menos um polo.');
  return { poloId: preferred && poloIds.includes(preferred) ? preferred : poloIds[0], poloIds };
}
