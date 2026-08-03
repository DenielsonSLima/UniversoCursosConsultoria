import React from 'react';
import { CalendarClock, Eye, GraduationCap, Loader2, MegaphoneOff, MonitorPlay, School, Settings, Users2 } from 'lucide-react';

export interface TechnicalEnrollmentSettingsValue {
  publicarNoSite?: boolean;
  permitirInscricoesOnline: boolean;
  dataInicioInscricao: string;
  dataFimInscricao: string;
  qtdVagasMinima: number;
  bloquearMatriculasAposCompletarVagas: boolean;
  exigeMatricula: boolean;
  aceitaConcomitante?: boolean;
  aceitaSubsequente?: boolean;
  serieMinimaEnsinoMedio?: number;
}

interface TechnicalEnrollmentSettingsProps {
  value: TechnicalEnrollmentSettingsValue;
  onChange: (patch: Partial<TechnicalEnrollmentSettingsValue>) => void;
  onlineEnrollmentLocked?: boolean;
  onCloseOnlineEnrollments?: () => void;
  isClosingOnlineEnrollments?: boolean;
}

const TechnicalEnrollmentSettings: React.FC<TechnicalEnrollmentSettingsProps> = ({
  value,
  onChange,
  onlineEnrollmentLocked = false,
  onCloseOnlineEnrollments,
  isClosingOnlineEnrollments = false,
}) => {
  const aceitaConcomitante = value.aceitaConcomitante ?? true;
  const aceitaSubsequente = value.aceitaSubsequente ?? true;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Divulgação e matrícula</p>
      <p className="mt-1 text-xs font-medium text-slate-500">
        A visibilidade da landing page e a inscrição online são controles independentes.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className={`flex items-start gap-3 rounded-xl border p-4 transition ${value.publicarNoSite ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
        <input
          type="checkbox"
          checked={value.publicarNoSite === true}
          onChange={(event) => onChange({ publicarNoSite: event.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600"
        />
        <span>
          <span className="flex items-center gap-2 text-xs font-bold uppercase text-[#001a33]">
            <Eye size={14} className="text-blue-600" /> Exibir esta turma no site
          </span>
          <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">
            Publica a landing page e permite anunciar a turma, mesmo com matrícula somente presencial.
          </span>
        </span>
      </label>

      <label className={`flex items-start gap-3 rounded-xl border p-4 transition ${value.permitirInscricoesOnline ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
        <input
          type="checkbox"
          checked={value.permitirInscricoesOnline}
          disabled={onlineEnrollmentLocked || isClosingOnlineEnrollments}
          onChange={(event) => onChange({ permitirInscricoesOnline: event.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span>
          <span className="flex items-center gap-2 text-xs font-bold uppercase text-[#001a33]">
            <MonitorPlay size={14} className="text-emerald-600" /> Habilitar inscrições online
          </span>
          <span className="mt-1 block text-[10px] font-semibold leading-relaxed text-slate-500">
            Dentro da janela configurada, salvar abre o cadastro e o pagamento online.
          </span>
        </span>
      </label>
    </div>

    {onlineEnrollmentLocked && (
      <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 md:flex-row md:items-center md:justify-between">
        <p className="text-[11px] font-semibold leading-relaxed">
          A turma está com inscrições abertas. Feche essa fase para desligar o cadastro online. A landing page seguirá a opção “Exibir esta turma no site”.
        </p>
        {onCloseOnlineEnrollments && (
          <button
            type="button"
            onClick={onCloseOnlineEnrollments}
            disabled={isClosingOnlineEnrollments}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-[10px] font-black uppercase text-white disabled:opacity-50"
          >
            {isClosingOnlineEnrollments ? <Loader2 size={14} className="animate-spin" /> : <MegaphoneOff size={14} />}
            Fechar inscrições
          </button>
        )}
      </div>
    )}

    {value.permitirInscricoesOnline && (
      <div className="space-y-4 border-t border-emerald-100 pt-4">
        <div className="space-y-3 rounded-xl border border-emerald-100 bg-white/70 p-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase text-[#001a33]">
              <School size={14} className="text-emerald-600" /> Regras de escolaridade
            </p>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-emerald-800/70">
              Defina se a turma aceita alunos cursando ou com o Ensino Médio já concluído.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-white p-3 text-xs font-bold text-emerald-800">
              <input
                type="checkbox"
                checked={aceitaConcomitante}
                disabled={aceitaConcomitante && !aceitaSubsequente}
                onChange={(event) => onChange({ aceitaConcomitante: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 disabled:opacity-50"
              />
              <span>
                <span className="block uppercase">Concomitante</span>
                <span className="mt-1 block text-[10px] font-medium normal-case leading-relaxed text-slate-500">
                  Para quem ainda está cursando o Ensino Médio.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-white p-3 text-xs font-bold text-emerald-800">
              <input
                type="checkbox"
                checked={aceitaSubsequente}
                disabled={aceitaSubsequente && !aceitaConcomitante}
                onChange={(event) => onChange({ aceitaSubsequente: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 disabled:opacity-50"
              />
              <span>
                <span className="block uppercase">Subsequente</span>
                <span className="mt-1 block text-[10px] font-medium normal-case leading-relaxed text-slate-500">
                  Para quem já concluiu o Ensino Médio.
                </span>
              </span>
            </label>
          </div>

          {aceitaConcomitante && (
            <div className="max-w-xs space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700">
                <GraduationCap size={14} /> Série mínima do Ensino Médio
              </label>
              <select
                value={value.serieMinimaEnsinoMedio ?? 2}
                onChange={(event) => onChange({ serieMinimaEnsinoMedio: Number(event.target.value) })}
                className="w-full rounded-xl border border-emerald-100 bg-white p-3 outline-none focus:border-emerald-500"
              >
                <option value={2}>2ª série</option>
                <option value={3}>3ª série</option>
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700">
              <CalendarClock size={14} /> Início Inscrições
            </label>
            <input type="date" value={value.dataInicioInscricao}
              onChange={(event) => onChange({ dataInicioInscricao: event.target.value })}
              className="w-full rounded-xl border border-emerald-100 bg-white p-3 outline-none focus:border-emerald-500" />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700">
              <CalendarClock size={14} /> Fim Inscrições
            </label>
            <input type="date" value={value.dataFimInscricao}
              onChange={(event) => onChange({ dataFimInscricao: event.target.value })}
              className="w-full rounded-xl border border-emerald-100 bg-white p-3 outline-none focus:border-emerald-500" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700">
              <Users2 size={14} /> Limite de alunos online
            </label>
            <input type="number" min="0" value={value.qtdVagasMinima}
              onChange={(event) => onChange({ qtdVagasMinima: parseInt(event.target.value, 10) || 0 })}
              className="w-full rounded-xl border border-emerald-100 bg-white p-3 outline-none focus:border-emerald-500" />
          </div>
          <div className="space-y-3 md:pt-7">
            <label className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700">
              <input type="checkbox" checked={value.bloquearMatriculasAposCompletarVagas}
                onChange={(event) => onChange({ bloquearMatriculasAposCompletarVagas: event.target.checked })}
                className="h-4 w-4 rounded border-emerald-300 text-emerald-600" />
              Fechar matrícula ao completar vagas
            </label>
            <label className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-700">
              <Settings size={14} />
              <input type="checkbox" checked={value.exigeMatricula}
                onChange={(event) => onChange({ exigeMatricula: event.target.checked })}
                className="h-4 w-4 rounded border-emerald-300 text-emerald-600" />
              Exigir pagamento de matrícula
            </label>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default TechnicalEnrollmentSettings;
