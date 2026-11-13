import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { eadTurmaKeys } from '../ead-turma.keys';

interface Props {
  matriculaId: string;
  turmaId: string;
  expiresAt?: string | null;
  accessActive?: boolean;
  allowed: boolean;
}

export const EadTrustAccessAction = ({ matriculaId, turmaId, expiresAt, accessActive, allowed }: Props) => {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!allowed) throw new Error('Sem permissão para liberar acesso.');
      const { data, error } = await supabase.rpc('ead_liberar_por_confianca', { p_matricula_id: matriculaId });
      if (error) throw error;
      if (typeof data !== 'string' || !Number.isFinite(Date.parse(data))) {
        throw new Error('Não foi possível confirmar o prazo. Atualize a consulta antes de tentar novamente.');
      }
      return data;
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: eadTurmaKeys.turma(turmaId) }); },
  });
  const deadline = expiresAt || mutation.data;
  const deadlineMs = Date.parse(deadline || '');
  const active = accessActive !== false && Number.isFinite(deadlineMs) && deadlineMs > now;
  const hasGrant = Boolean(deadline);
  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    const updateWhenVisible = () => { if (document.visibilityState === 'visible') updateClock(); };
    updateClock();
    const remaining = deadlineMs - Date.now();
    const timer = Number.isFinite(remaining) && remaining > 0
      ? window.setTimeout(updateClock, Math.min(remaining + 1, 2_147_483_647)) : undefined;
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', updateWhenVisible);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', updateWhenVisible);
    };
  }, [deadlineMs]);
  return <div className="space-y-1 text-right">
    {active ? <p className="text-[11px] font-medium text-blue-700">
      Por confiança até {new Date(deadline!).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}
    </p> : hasGrant ? <p className="text-[11px] font-medium text-amber-800">
      {accessActive === false && deadlineMs > now ? 'Liberação temporária encerrada. Aguarde a confirmação do pagamento.'
        : Number.isFinite(deadlineMs) ? 'Prazo encerrado. Aguardando confirmação do pagamento.' : 'Prazo indisponível. Aguarde a atualização da turma.'}
    </p> : allowed ? <button type="button" disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      className="rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
      {mutation.isPending ? 'Liberando…' : 'Liberar por confiança · 24h'}
    </button> : null}
    <p className="text-[10px] text-slate-500">{active ? 'Temporário, sem baixa financeira.' : 'Liberação definitiva após pagamento.'}</p>
    {mutation.isError && <p role="alert" className="text-[11px] text-red-700">{mutation.error.message}</p>}
  </div>;
};
