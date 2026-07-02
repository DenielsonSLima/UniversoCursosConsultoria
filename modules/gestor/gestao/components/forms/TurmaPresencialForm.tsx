import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  Clock,
  Lock,
  MapPin,
  MonitorPlay,
  Percent,
  PercentCircle,
  ReceiptText,
  Save,
  Settings,
  Users2,
  Wallet,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Turno } from '../../gestao.types';
import { polosService } from '../../../configuracoes/polos/polos.service';

export interface TurmaPresencialFormData {
  cursoId: string;
  poloId: string;
  dataInicio: string;
  dataPrevisaoTermino: string;
  turno: Turno;
  vagasTotais: number;
  valorMatricula: number;
  valorRematricula: number;
  qtdParcelas: number;
  valorParcela: number;
  descontoPontualidade: number;
  jurosAtraso: number;
  multaAtraso: number;
  diaVencimentoPadrao: number;
  dataInicioInscricao: string;
  dataFimInscricao: string;
  permitirInscricoesOnline: boolean;
  exigeMatricula: boolean;
  origemFinanceira: 'NORMAL' | 'LEGADO';
  financeiroHerdado: boolean;
  gerarCobrancasFuturas: boolean;
  sincronizarAsaasFuturo: boolean;
  qtdVagasMinima: number;
  bloquearMatriculasAposCompletarVagas: boolean;
  nomeAutomatico: string;
  codigoAutomatico: string;
}

interface TurmaPresencialTheme {
  accentText: string;
  accentMutedText: string;
  accentBorderFocus: string;
  accentHoverBg: string;
  accentSoftBg: string;
  accentSoftBorder: string;
  checkboxText: string;
}

interface TurmaPresencialFormConfig {
  modalidade: 'LIVRE' | 'ESPECIALIZACAO';
  title: string;
  subtitle: string;
  cursoLabel: string;
  submitLabel: string;
  automaticLabel: string;
  Icon: LucideIcon;
  theme: TurmaPresencialTheme;
  defaults: TurmaPresencialFormData;
  generateIdentity: (params: {
    curso: any;
    polo: any;
    formData: TurmaPresencialFormData;
  }) => { nome: string; codigo: string } | null;
}

interface TurmaPresencialFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  cursosDisponiveis: any[];
  selectedPoloId?: string;
  config: TurmaPresencialFormConfig;
}

const numberOrDefault = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const TurmaPresencialForm: React.FC<TurmaPresencialFormProps> = ({
  isOpen,
  onClose,
  onSave,
  cursosDisponiveis,
  selectedPoloId,
  config,
}) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [formData, setFormData] = useState<TurmaPresencialFormData>(config.defaults);
  const Icon = config.Icon;

  useEffect(() => {
    polosService.getAll().then(setPolos);
  }, []);

  useEffect(() => {
    setFormData(config.defaults);
  }, [config.defaults]);

  useEffect(() => {
    if (selectedPoloId) {
      setFormData(prev => ({ ...prev, poloId: selectedPoloId }));
    }
  }, [selectedPoloId]);

  useEffect(() => {
    if (!formData.cursoId || !formData.poloId || !formData.dataInicio || !formData.turno) return;

    const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
    const polo = polos.find(p => p.id === formData.poloId);
    if (!curso || !polo) return;

    const identity = config.generateIdentity({ curso, polo, formData });
    if (!identity) return;

    setFormData(prev => ({
      ...prev,
      nomeAutomatico: identity.nome,
      codigoAutomatico: identity.codigo,
    }));
  }, [config, cursosDisponiveis, formData.cursoId, formData.dataInicio, formData.poloId, formData.turno, polos]);

  if (!isOpen) return null;

  const selectedPolo = polos.find(p => p.id === formData.poloId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const curso = cursosDisponiveis.find(c => c.id === formData.cursoId);
    const polo = selectedPolo;

    if (!curso || !polo) {
      alert('Selecione curso e polo');
      return;
    }

    onSave({
      ...formData,
      nome: formData.nomeAutomatico,
      codigo: formData.codigoAutomatico,
      cursoNome: curso.nome,
      poloNome: polo.cidade,
      modalidade: config.modalidade,
      status: 'EM_ANDAMENTO',
    });
    onClose();
  };

  const updateForm = (patch: Partial<TurmaPresencialFormData>) => {
    setFormData(prev => ({ ...prev, ...patch }));
  };

  const inputClass = `w-full p-3 rounded-xl border border-slate-200 outline-none ${config.theme.accentBorderFocus} bg-slate-50`;
  const selectClass = `w-full p-3 rounded-xl border border-slate-200 bg-white text-slate-700 outline-none ${config.theme.accentBorderFocus}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>

      <div className="relative bg-white rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-fadeIn border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">{config.title}</h3>
            <p className="text-xs text-slate-500 font-medium">{config.subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className={selectedPoloId ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                <Icon size={14} className={config.theme.accentText} /> {config.cursoLabel}
              </label>
              <select
                className={selectClass}
                value={formData.cursoId}
                onChange={(e) => updateForm({ cursoId: e.target.value })}
                required
              >
                <option value="">Selecione...</option>
                {cursosDisponiveis.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {selectedPoloId ? (
              <div className={`rounded-xl border ${config.theme.accentSoftBorder} ${config.theme.accentSoftBg} px-4 py-3`}>
                <div className="flex items-start gap-3">
                  <MapPin size={16} className={`mt-0.5 shrink-0 ${config.theme.accentText}`} />
                  <div className="min-w-0">
                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${config.theme.accentMutedText}`}>Polo atual</p>
                    <p className="truncate text-sm font-black uppercase text-[#001a33]">
                      {selectedPolo ? `${selectedPolo.nomeFantasia || selectedPolo.nome} (${selectedPolo.cidade})` : 'Carregando polo...'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider flex items-center gap-2">
                  <MapPin size={14} className={config.theme.accentText} /> Polo
                </label>
                <select
                  className={selectClass}
                  value={formData.poloId}
                  onChange={(e) => updateForm({ poloId: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {polos.map(p => (
                    <option key={p.id} value={p.id}>{p.nomeFantasia} ({p.cidade})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <Clock size={14} /> Turno
              </label>
              <select
                className={`w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none ${config.theme.accentBorderFocus}`}
                value={formData.turno}
                onChange={(e) => updateForm({ turno: e.target.value as Turno })}
              >
                <option value="MATUTINO">Matutino</option>
                <option value="VESPERTINO">Vespertino</option>
                <option value="NOTURNO">Noturno</option>
                <option value="INTEGRAL">Integral</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <Calendar size={14} /> Início
              </label>
              <input
                type="date"
                className={inputClass}
                value={formData.dataInicio}
                onChange={(e) => updateForm({ dataInicio: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <Calendar size={14} /> Fim Previsto
              </label>
              <input
                type="date"
                className={inputClass}
                value={formData.dataPrevisaoTermino}
                onChange={(e) => updateForm({ dataPrevisaoTermino: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Vagas Totais</label>
            <input
              type="number"
              className={inputClass}
              value={formData.vagasTotais}
              onChange={(e) => updateForm({ vagasTotais: parseInt(e.target.value, 10) || 0 })}
              required
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <label className="flex items-start gap-3 text-xs font-bold uppercase text-slate-600">
              <input
                type="checkbox"
                checked={formData.permitirInscricoesOnline}
                onChange={(e) => updateForm({ permitirInscricoesOnline: e.target.checked })}
                className={`mt-0.5 h-4 w-4 rounded border-slate-300 ${config.theme.checkboxText}`}
              />
              <span>
                <span className="flex items-center gap-2 text-[#001a33]">
                  <MonitorPlay size={14} className={config.theme.accentText} />
                  Permitir inscrições online
                </span>
                <span className="mt-1 block text-[10px] font-bold normal-case leading-relaxed text-slate-500">
                  Mostra o botão de matrícula no portal do aluno e no site para esta turma.
                </span>
              </span>
            </label>

            {formData.permitirInscricoesOnline && (
              <div className="space-y-4 border-t border-slate-200 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <CalendarClock size={14} />
                      Início Inscrições
                    </label>
                    <input
                      type="date"
                      className={inputClass}
                      value={formData.dataInicioInscricao}
                      onChange={(e) => updateForm({ dataInicioInscricao: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <CalendarClock size={14} />
                      Fim Inscrições
                    </label>
                    <input
                      type="date"
                      className={inputClass}
                      value={formData.dataFimInscricao}
                      onChange={(e) => updateForm({ dataFimInscricao: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Users2 size={14} />
                      Limite de alunos online
                    </label>
                    <input
                      type="number"
                      className={inputClass}
                      value={formData.qtdVagasMinima}
                      onChange={(e) => updateForm({ qtdVagasMinima: parseInt(e.target.value, 10) || 0 })}
                      min="0"
                    />
                  </div>
                  <div className="space-y-3 md:pt-6">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.bloquearMatriculasAposCompletarVagas}
                        onChange={(e) => updateForm({ bloquearMatriculasAposCompletarVagas: e.target.checked })}
                        className={`h-4 w-4 rounded border-slate-300 ${config.theme.checkboxText}`}
                      />
                      Fechar matrícula ao completar vagas
                    </label>
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Settings size={14} />
                      <input
                        type="checkbox"
                        checked={formData.exigeMatricula}
                        onChange={(e) => updateForm({ exigeMatricula: e.target.checked })}
                        className={`h-4 w-4 rounded border-slate-300 ${config.theme.checkboxText}`}
                      />
                      Exigir pagamento de matrícula
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <ReceiptText size={14} />
              Configuração financeira da turma
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Wallet size={12} />
                  Valor da matrícula (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={formData.valorMatricula}
                  onChange={(e) => updateForm({ valorMatricula: numberOrDefault(e.target.value, 0) })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Rematrícula (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={formData.valorRematricula}
                  onChange={(e) => updateForm({ valorRematricula: numberOrDefault(e.target.value, 0) })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Número de parcelas</label>
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={formData.qtdParcelas}
                  onChange={(e) => updateForm({ qtdParcelas: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Valor parcela (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={formData.valorParcela}
                  onChange={(e) => updateForm({ valorParcela: numberOrDefault(e.target.value, 0) })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Percent size={12} />
                  Desconto pontualidade (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={formData.descontoPontualidade}
                  onChange={(e) => updateForm({ descontoPontualidade: numberOrDefault(e.target.value, 0) })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                  <PercentCircle size={12} />
                  Juros atraso (% ao mês)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={inputClass}
                  value={formData.jurosAtraso}
                  onChange={(e) => updateForm({ jurosAtraso: numberOrDefault(e.target.value, 0) })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Multa atraso (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={formData.multaAtraso}
                  onChange={(e) => updateForm({ multaAtraso: numberOrDefault(e.target.value, 0) })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Dia vencimento padrão</label>
                <select
                  className={`w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 outline-none ${config.theme.accentBorderFocus}`}
                  value={formData.diaVencimentoPadrao}
                  onChange={(e) => updateForm({ diaVencimentoPadrao: parseInt(e.target.value, 10) || 10 })}
                >
                  {[5, 10, 15, 20, 25, 28].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Configuração financeira para turmas em andamento
            </p>
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.origemFinanceira === 'LEGADO'}
                onChange={(e) => {
                  const legado = e.target.checked;
                  updateForm({
                    origemFinanceira: legado ? 'LEGADO' : 'NORMAL',
                    financeiroHerdado: legado,
                    gerarCobrancasFuturas: legado ? formData.gerarCobrancasFuturas : formData.gerarCobrancasFuturas,
                    sincronizarAsaasFuturo: formData.sincronizarAsaasFuturo,
                  });
                }}
                className={`h-4 w-4 rounded border-slate-300 ${config.theme.checkboxText}`}
              />
              Turma com histórico financeiro anterior
            </label>
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.gerarCobrancasFuturas}
                onChange={(e) => updateForm({ gerarCobrancasFuturas: e.target.checked })}
                className={`h-4 w-4 rounded border-slate-300 ${config.theme.checkboxText}`}
              />
              Gerar cobranças futuras
            </label>
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.sincronizarAsaasFuturo}
                onChange={(e) => updateForm({ sincronizarAsaasFuturo: e.target.checked })}
                className={`h-4 w-4 rounded border-slate-300 ${config.theme.checkboxText}`}
              />
              Sincronizar futuras cobranças com Asaas
            </label>
          </div>

          <div className={`${config.theme.accentSoftBg} p-4 rounded-xl border ${config.theme.accentSoftBorder} space-y-3`}>
            <div className={`flex items-center gap-2 ${config.theme.accentMutedText} mb-1`}>
              <Lock size={12} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{config.automaticLabel}</span>
            </div>
            <div>
              <div className="font-bold text-[#001a33] text-sm break-words">
                {formData.nomeAutomatico || 'Selecione os dados acima...'}
              </div>
              <div className="font-mono font-bold text-[#001a33] text-xs tracking-wider mt-1 opacity-70">
                {formData.codigoAutomatico}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={!formData.nomeAutomatico}
              className={`px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider ${config.theme.accentHoverBg} transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Save size={16} /> {config.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TurmaPresencialForm;
