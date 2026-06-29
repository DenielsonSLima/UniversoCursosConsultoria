import React, { useState } from 'react';
import { CalendarClock, Loader2, MonitorPlay, Save, Settings, ShieldCheck, Users2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Turma } from '../../../gestao.types';
import { gestaoService } from '../../../gestao.service';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';

interface TurmaConfiguracoesProps {
  turma: Turma;
}

const TurmaConfiguracoes: React.FC<TurmaConfiguracoesProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    nome: turma.nome,
    dataInicio: turma.dataInicio || '',
    dataPrevisaoTermino: turma.dataPrevisaoTermino || '',
    dataInicioInscricao: turma.dataInicioInscricao || '',
    dataFimInscricao: turma.dataFimInscricao || '',
    permitirInscricoesOnline: turma.permitirInscricoesOnline ?? false,
    exigeMatricula: turma.exigeMatricula ?? true,
    qtdVagasMinima: turma.qtdVagasMinima ?? 0,
    bloquearMatriculasAposCompletarVagas: turma.bloquearMatriculasAposCompletarVagas ?? true,
    origemFinanceira: turma.origemFinanceira || 'NORMAL',
    financeiroHerdado: turma.financeiroHerdado || false,
    gerarCobrancasFuturas: turma.gerarCobrancasFuturas || false,
    sincronizarAsaasFuturo: turma.sincronizarAsaasFuturo ?? true,
  });

  const saveMutation = useMutation({
    mutationFn: () => gestaoService.updateTurmaBasic(turma.id, form),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turma.id) }),
        queryClient.invalidateQueries({ queryKey: ['gestao-kpis'] }),
      ]);
      toast.success('Turma atualizada', 'As informações foram salvas no Supabase.');
    },
    onError: (error: any) => toast.error('Erro ao salvar', error.message),
  });

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm animate-fadeIn">
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
            value={turma.status.replace('_', ' ')}
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

        <div className="md:col-span-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 space-y-4">
          <label className="flex items-start gap-3 text-xs font-bold uppercase text-blue-700">
            <input
              type="checkbox"
              checked={form.permitirInscricoesOnline}
              onChange={(event) => setForm((current) => ({ ...current, permitirInscricoesOnline: event.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600"
            />
            <span>
              <span className="flex items-center gap-2 text-[#001a33]">
                <MonitorPlay size={14} className="text-blue-600" />
                Permitir inscrições online
              </span>
              <span className="mt-1 block text-[10px] font-bold normal-case leading-relaxed text-blue-700/70">
                Mostra o botão de matrícula no portal do aluno e no site para esta turma.
              </span>
            </span>
          </label>

          {form.permitirInscricoesOnline && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-blue-100 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-blue-700 uppercase flex items-center gap-2">
                  <CalendarClock size={14} />
                  Início Inscrições
                </label>
                <input
                  type="date"
                  value={form.dataInicioInscricao}
                  onChange={(event) => setForm((current) => ({ ...current, dataInicioInscricao: event.target.value }))}
                  className="w-full p-3 bg-white border border-blue-100 rounded-xl outline-none focus:border-blue-500 text-slate-700"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-blue-700 uppercase flex items-center gap-2">
                  <CalendarClock size={14} />
                  Fim Inscrições
                </label>
                <input
                  type="date"
                  value={form.dataFimInscricao}
                  onChange={(event) => setForm((current) => ({ ...current, dataFimInscricao: event.target.value }))}
                  className="w-full p-3 bg-white border border-blue-100 rounded-xl outline-none focus:border-blue-500 text-slate-700"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-blue-700 uppercase flex items-center gap-2">
                  <Users2 size={14} />
                  Limite de alunos online
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.qtdVagasMinima}
                  onChange={(event) => setForm((current) => ({ ...current, qtdVagasMinima: parseInt(event.target.value, 10) || 0 }))}
                  className="w-full p-3 bg-white border border-blue-100 rounded-xl outline-none focus:border-blue-500 text-slate-700"
                />
              </div>
              <div className="space-y-3 md:pt-7">
                <label className="text-xs font-bold text-blue-700 uppercase flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.bloquearMatriculasAposCompletarVagas}
                    onChange={(event) => setForm((current) => ({ ...current, bloquearMatriculasAposCompletarVagas: event.target.checked }))}
                    className="h-4 w-4 rounded border-blue-300 text-blue-600"
                  />
                  Fechar matrícula ao completar vagas
                </label>
                <label className="text-xs font-bold text-blue-700 uppercase flex items-center gap-2">
                  <Settings size={14} />
                  <input
                    type="checkbox"
                    checked={form.exigeMatricula}
                    onChange={(event) => setForm((current) => ({ ...current, exigeMatricula: event.target.checked }))}
                    className="h-4 w-4 rounded border-blue-300 text-blue-600"
                  />
                  Exigir pagamento de matrícula
                </label>
              </div>
            </div>
          )}
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
      </div>

      <button
        onClick={() => saveMutation.mutate()}
        disabled={!form.nome.trim() || saveMutation.isPending}
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
