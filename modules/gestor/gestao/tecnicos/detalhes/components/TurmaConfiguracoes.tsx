import React, { useEffect, useState } from 'react';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Turma } from '../../../gestao.types';
import { gestaoService } from '../../../gestao.service';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { invalidateSiteTickerQueries } from '../../../../../public/siteTicker.keys';
import TechnicalAcademicSettings from '../../../components/forms/TechnicalAcademicSettings';
import TechnicalEnrollmentSettings from '../../../components/forms/TechnicalEnrollmentSettings';
import { gestaoQueryKeys } from '../../../gestao.query-keys';
import { academicLifecycleService } from '../academic-lifecycle.service';
import { invalidateTechnicalLandingQueries } from '../../../../../public/landing-pages/cursos-tecnicos/technicalLanding.keys';

interface TurmaConfiguracoesProps {
  turma: Turma;
}

const TurmaConfiguracoes: React.FC<TurmaConfiguracoesProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStatus, setCurrentStatus] = useState(turma.status);
  const [form, setForm] = useState({
    nome: turma.nome,
    dataInicio: turma.dataInicio || '',
    dataPrevisaoTermino: turma.dataPrevisaoTermino || '',
    dataInicioInscricao: turma.dataInicioInscricao || '',
    dataFimInscricao: turma.dataFimInscricao || '',
    publicarNoSite: turma.publicarNoSite ?? false,
    permitirInscricoesOnline: turma.permitirInscricoesOnline ?? false,
    exigeMatricula: turma.exigeMatricula ?? true,
    aceitaConcomitante: turma.aceitaConcomitante ?? true,
    aceitaSubsequente: turma.aceitaSubsequente ?? true,
    serieMinimaEnsinoMedio: turma.serieMinimaEnsinoMedio ?? 2,
    qtdVagasMinima: turma.qtdVagasMinima ?? 0,
    frequenciaMinimaPercent: turma.frequenciaMinimaPercent ?? 75,
    mediaMinima: turma.mediaMinima ?? 6,
    bloquearMatriculasAposCompletarVagas: turma.bloquearMatriculasAposCompletarVagas ?? true,
    origemFinanceira: turma.origemFinanceira || 'NORMAL',
    financeiroHerdado: turma.financeiroHerdado || false,
    gerarCobrancasFuturas: turma.gerarCobrancasFuturas || false,
    sincronizarAsaasFuturo: turma.sincronizarAsaasFuturo ?? true,
  });

  useEffect(() => {
    setCurrentStatus(turma.status);
  }, [turma.status]);

  const saveMutation = useMutation({
    mutationFn: () => gestaoService.updateTurmaBasic(turma.id, form),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turma.id) }),
        queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.summaries() }),
        queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') }),
        invalidateSiteTickerQueries(queryClient),
        invalidateTechnicalLandingQueries(queryClient),
      ]);
      toast.success('Turma atualizada', 'As informações foram salvas no Supabase.');
    },
    onError: (error: any) => toast.error('Erro ao salvar', error.message),
  });

  const closeOnlineEnrollmentsMutation = useMutation({
    mutationFn: () => academicLifecycleService.alterarStatusTurma(turma.id, 'PLANEJADA'),
    onSuccess: async () => {
      setCurrentStatus('PLANEJADA');
      setForm((current) => ({ ...current, permitirInscricoesOnline: false }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turma.id) }),
        queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.summaries() }),
        queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') }),
        invalidateSiteTickerQueries(queryClient),
        invalidateTechnicalLandingQueries(queryClient),
      ]);
      toast.success(
        'Inscrições online fechadas',
        form.publicarNoSite
          ? 'A turma voltou ao planejamento, mas a landing page continua visível para atendimento presencial.'
          : 'A turma voltou ao planejamento e o cadastro online foi desativado.',
      );
    },
    onError: (error: any) => toast.error('Inscrições não fechadas', error.message),
  });

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm ">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-5 mb-6">
        <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><ShieldCheck size={19} /></div>
        <div>
          <h3 className="text-lg font-bold text-[#001a33]">Configuração da Turma</h3>
          <p className="text-xs text-slate-500 mt-1">
            Encerramento e exclusões acadêmicas são controlados no Ciclo Acadêmico para preservar o histórico.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Nome da Turma</label>
          <input
            value={form.nome}
            onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-slate-700 font-bold"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Polo</label>
          <input
            value={turma.poloNome || ''}
            readOnly
            className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Situação</label>
          <input
            value={currentStatus.replace('_', ' ')}
            readOnly
            className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Data Início</label>
          <input
            type="date"
            value={form.dataInicio}
            onChange={(event) => setForm((current) => ({ ...current, dataInicio: event.target.value }))}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-slate-700"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Previsão Término</label>
          <input
            type="date"
            value={form.dataPrevisaoTermino}
            onChange={(event) => setForm((current) => ({ ...current, dataPrevisaoTermino: event.target.value }))}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 text-slate-700"
          />
        </div>

        <div className="md:col-span-2">
          <TechnicalEnrollmentSettings
            value={form}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            onlineEnrollmentLocked={currentStatus === 'INSCRICOES_ABERTAS'}
            onCloseOnlineEnrollments={() => closeOnlineEnrollmentsMutation.mutate()}
            isClosingOnlineEnrollments={closeOnlineEnrollmentsMutation.isPending || saveMutation.isPending}
          />
        </div>

        <div className="md:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Financeiro legado / histórico</p>
          <label className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.origemFinanceira === 'LEGADO'}
              onChange={(e) => setForm((current) => ({
                ...current,
                origemFinanceira: e.target.checked ? 'LEGADO' : 'NORMAL',
                financeiroHerdado: e.target.checked || current.financeiroHerdado,
              }))}
              className="h-4 w-4 rounded border-emerald-300 text-emerald-600"
            />
            Turma com histórico financeiro anterior
          </label>
          <label className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.gerarCobrancasFuturas}
              onChange={(e) => setForm((current) => ({ ...current, gerarCobrancasFuturas: e.target.checked }))}
              className="h-4 w-4 rounded border-emerald-300 text-emerald-600"
            />
            Gerar cobranças futuras
          </label>
          <label className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.sincronizarAsaasFuturo}
              onChange={(e) => setForm((current) => ({ ...current, sincronizarAsaasFuturo: e.target.checked }))}
              className="h-4 w-4 rounded border-emerald-300 text-emerald-600"
            />
            Sincronizar futuras cobranças com Asaas
          </label>
        </div>

        <div className="md:col-span-2">
          <TechnicalAcademicSettings
            frequenciaMinimaPercent={form.frequenciaMinimaPercent}
            mediaMinima={form.mediaMinima}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            disabled={currentStatus === 'FINALIZADA'}
          />
        </div>
      </div>

      <button
        onClick={() => saveMutation.mutate()}
        disabled={!form.nome.trim() || saveMutation.isPending || closeOnlineEnrollmentsMutation.isPending}
        className="flex items-center justify-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-emerald-900 transition-colors disabled:opacity-40"
      >
        {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Salvar Alterações
      </button>

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaConfiguracoes;
