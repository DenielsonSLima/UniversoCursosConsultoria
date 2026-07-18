import React from 'react';
import { Clock, Lock } from 'lucide-react';
import { PortalAuthProfile } from '../../login/portal-session';

interface LogoutProps {
  onLogout: () => void | Promise<void>;
}

const WEEK_DAY_LABELS: Record<number, string> = {
  1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 0: 'Dom',
};

export const ScheduleBlockedScreen: React.FC<LogoutProps & { profile: PortalAuthProfile }> = ({ profile, onLogout }) => (
  <div className="flex h-screen w-screen items-center justify-center bg-slate-900 font-sans p-6 text-white">
    <div className="bg-slate-800/80 border border-slate-700/50 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-2xl shadow-blue-900/10 text-center max-w-md w-full relative overflow-hidden flex flex-col items-center">
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-8 -mt-8" />
      <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-6"><Clock size={32} /></div>
      <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Acesso Fora do Expediente</h2>
      <p className="text-slate-400 text-sm leading-relaxed mb-6">Olá, <span className="text-white font-semibold">{profile.nome}</span>. Seu perfil possui restrição de dias e horários para uso do sistema.</p>
      <div className="bg-slate-900/50 border border-slate-700/30 rounded-2xl p-4 w-full text-left space-y-2 mb-8">
        <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">Regras de Horário</p>
        <p className="text-xs text-slate-300 font-medium leading-relaxed">
          <strong>Dias permitidos:</strong> {profile.restricao_horario?.dias.map(day => WEEK_DAY_LABELS[day] || '').join(', ')}
        </p>
        <p className="text-xs text-slate-300 font-medium"><strong>Horário:</strong> das {profile.restricao_horario?.horario_inicio} às {profile.restricao_horario?.horario_fim}</p>
      </div>
      <button onClick={onLogout} className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-purple-600/20 hover:shadow-xl transition-all">Sair do Sistema</button>
    </div>
  </div>
);

export const NoAccessScreen: React.FC<LogoutProps & { kind: 'units' | 'modules' }> = ({ kind, onLogout }) => (
  <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
    <div className="w-full max-w-md rounded-[2rem] border border-rose-100 bg-white p-8 text-center shadow-xl">
      <Lock className="mx-auto mb-4 text-rose-500" size={36} />
      <h1 className="text-xl font-black text-[#001a33]">{kind === 'units' ? 'Nenhuma unidade disponível' : 'Nenhum módulo disponível'}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        {kind === 'units'
          ? 'O usuário não possui uma unidade ativa dentro do seu escopo de acesso. Solicite o ajuste ao administrador.'
          : 'Seu usuário está ativo, mas não possui módulos liberados. Solicite o ajuste ao administrador.'}
      </p>
      <button onClick={onLogout} className="mt-6 w-full rounded-xl bg-[#001a33] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white">Sair do sistema</button>
    </div>
  </div>
);
