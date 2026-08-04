import { Bell, Loader2, Settings2 } from 'lucide-react';
import { nativeAppService } from './native-app.service';
import { useAlunoAppDeviceStatus } from './native-app.queries';

const AlunoAppNotificationCard = ({ alunoId, compact = false }: { alunoId: string; compact?: boolean }) => {
  const { statusQuery, enableMutation, disableMutation } = useAlunoAppDeviceStatus(alunoId);
  if (!nativeAppService.isAvailable()) return null;

  const status = statusQuery.data;
  const isActive = Boolean(status?.notificationsEnabled);
  const isDenied = status?.permissionStatus === 'denied';
  const isBusy = statusQuery.isLoading || enableMutation.isPending || disableMutation.isPending;
  const error = enableMutation.error || disableMutation.error || statusQuery.error;

  // Este cartão é um convite de ativação, não um painel permanente. Depois do
  // consentimento, as preferências continuam disponíveis em Configurações.
  if (isActive) return null;

  return (
    <section className={`rounded-2xl border border-blue-100 bg-blue-50/70 p-4 ${compact ? '' : 'mx-5 mt-4'}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Bell size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-[#001a33]">Ative as notificações do app</h2>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
            Receba no celular avisos de atendimento e novidades importantes da Universo.
          </p>
          {error ? <p className="mt-2 text-xs font-bold text-rose-600">Não foi possível atualizar. Tente novamente.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={isBusy} onClick={() => enableMutation.mutate()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-md shadow-blue-900/15 disabled:opacity-60">
              {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Ativar notificações
            </button>
            {isDenied ? (
              <button type="button" onClick={() => void nativeAppService.openSettings()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-slate-600">
                <Settings2 size={14} /> Ajustes do celular
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AlunoAppNotificationCard;
