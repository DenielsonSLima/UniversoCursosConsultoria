import {
  ArrowLeft,
  BellOff,
  BellRing,
  CircleHelp,
  Clock3,
  History,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import type { AppDeviceAuditEvent, AppDeviceDetail } from './dispositivos-app.types';
import { useAlunoAppDeviceDetail } from './useDispositivosApp';

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'Não registrado';

const permissionLabel = (status: AppDeviceDetail['permissionStatus']) => ({
  granted: 'Concedida',
  provisional: 'Provisória',
  denied: 'Recusada no aparelho',
  not_determined: 'Ainda não solicitada',
}[status]);

const isNotificationActive = (device: AppDeviceDetail) => (
  device.active
  && device.sessionActive
  && device.notificationsEnabled
  && ['granted', 'provisional'].includes(device.permissionStatus)
);

const eventPresentation = (event: AppDeviceAuditEvent) => {
  if (event.event === 'installed') {
    return { title: 'Aplicativo instalado', description: 'A instalação foi vinculada a este aluno.', icon: Smartphone, tone: 'bg-blue-50 text-blue-700' };
  }
  if (event.event === 'permission') {
    if (event.permissionStatus === 'denied') {
      return { title: 'Permissão de notificações recusada', description: 'O sistema do aparelho não autorizou o envio de avisos.', icon: XCircle, tone: 'bg-rose-50 text-rose-700' };
    }
    if (event.notificationsEnabled && ['granted', 'provisional'].includes(event.permissionStatus || '')) {
      return { title: 'Notificações ativadas', description: 'O aluno consentiu em receber notificações neste aparelho.', icon: BellRing, tone: 'bg-emerald-50 text-emerald-700' };
    }
    if (event.notificationsEnabled === false) {
      return { title: 'Notificações desativadas', description: 'O consentimento de envio foi desativado neste aparelho.', icon: BellOff, tone: 'bg-amber-50 text-amber-700' };
    }
    return { title: 'Permissão de notificações alterada', description: 'Este é um registro anterior à trilha detalhada de consentimento.', icon: CircleHelp, tone: 'bg-slate-100 text-slate-600' };
  }
  if (event.event === 'session') {
    return event.sessionActive
      ? { title: 'Sessão iniciada', description: 'O aluno entrou no portal por este aparelho.', icon: LogIn, tone: 'bg-emerald-50 text-emerald-700' }
      : event.sessionActive === false
        ? { title: 'Sessão encerrada', description: 'O aluno saiu da conta neste aparelho.', icon: LogOut, tone: 'bg-slate-100 text-slate-600' }
        : { title: 'Sessão alterada', description: 'Registro anterior sem o estado detalhado da sessão.', icon: History, tone: 'bg-slate-100 text-slate-600' };
  }
  return event.deviceActive === false
    ? { title: 'Instalação desativada', description: 'Este aparelho deixou de receber atualizações do aplicativo.', icon: XCircle, tone: 'bg-rose-50 text-rose-700' }
    : { title: 'Aplicativo atualizado', description: event.appVersion ? `Versão ${event.appVersion} registrada.` : 'Informações do aplicativo foram atualizadas.', icon: Smartphone, tone: 'bg-blue-50 text-blue-700' };
};

const DeviceCard = ({ device, index }: { device: AppDeviceDetail; index: number }) => {
  const notificationsActive = isNotificationActive(device);
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Smartphone size={21} /></div>
          <div className="min-w-0">
            <h3 className="truncate font-bold text-[#001a33]">{device.deviceModel || `${device.platform === 'ios' ? 'iPhone/iPad' : 'Android'} ${index + 1}`}</h3>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">{device.platform} {device.appVersion ? `· Versão ${device.appVersion}` : ''}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] ${notificationsActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {notificationsActive ? 'Notificações ativas' : 'Notificações inativas'}
        </span>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Permissão do aparelho</dt><dd className="mt-1 font-semibold text-slate-700">{permissionLabel(device.permissionStatus)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Consentimento no app</dt><dd className="mt-1 font-semibold text-slate-700">{device.notificationsEnabled ? 'Ativado' : 'Desativado'}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Sessão</dt><dd className="mt-1 font-semibold text-slate-700">{device.sessionActive ? 'Logado' : 'Encerrada'}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Instalado em</dt><dd className="mt-1 font-semibold text-slate-700">{formatDate(device.installedAt)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Último acesso</dt><dd className="mt-1 font-semibold text-slate-700">{formatDate(device.lastSeenAt)}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Última ativação</dt><dd className="mt-1 font-semibold text-slate-700">{formatDate(device.consentAt)}</dd></div>
      </dl>
      {device.consentRevokedAt ? <p className="mt-3 flex items-center gap-2 text-xs font-bold text-amber-700"><BellOff size={15} /> Última desativação: {formatDate(device.consentRevokedAt)}</p> : null}
    </article>
  );
};

interface AlunoAppDeviceDetailProps {
  alunoId: string;
  onBack: () => void;
}

const AlunoAppDeviceDetail = ({ alunoId, onBack }: AlunoAppDeviceDetailProps) => {
  const { detailQuery, eventsQuery } = useAlunoAppDeviceDetail(alunoId);
  const detail = detailQuery.data;

  if (detailQuery.isLoading) return <div className="flex min-h-[460px] items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={30} /><span className="sr-only">Carregando histórico do aluno</span></div>;
  if (detailQuery.isError || !detail) return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center"><h3 className="font-bold text-rose-800">Não foi possível carregar o histórico</h3><button type="button" onClick={onBack} className="mt-4 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-white">Voltar à lista</button></div>;

  const activeNotifications = detail.dispositivos.filter(isNotificationActive).length;
  return (
    <div className="mx-auto max-w-6xl">
      <button type="button" onClick={onBack} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold uppercase tracking-[0.06em] text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700"><ArrowLeft size={17} /> Voltar para dispositivos</button>

      <header className="relative overflow-hidden rounded-[2rem] bg-[#001a33] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
        <div aria-hidden="true" className="absolute -right-12 -top-12 h-44 w-44 rounded-full border-[28px] border-blue-500/15" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-300"><ShieldCheck size={16} /> Auditoria de consentimento</div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{detail.nome}</h2>
            <p className="mt-2 text-sm font-medium text-slate-300">{detail.matricula || detail.email || 'Sem matrícula'} · {detail.poloNome || 'Sem polo'}</p>
            {detail.poloCidade || detail.poloUf ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-blue-200">{[detail.poloCidade, detail.poloUf].filter(Boolean).join(' · ')}</p> : null}
          </div>
          <div className={`inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-4 text-xs font-bold uppercase tracking-[0.06em] ring-1 sm:self-auto ${activeNotifications ? 'bg-emerald-400/10 text-emerald-200 ring-emerald-300/20' : 'bg-slate-400/10 text-slate-200 ring-slate-300/20'}`}>
            {activeNotifications ? <BellRing size={17} /> : <BellOff size={17} />}{activeNotifications ? `${activeNotifications} aparelho${activeNotifications === 1 ? '' : 's'} com avisos` : 'Sem avisos ativos'}
          </div>
        </div>
      </header>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2"><Smartphone className="text-blue-600" size={19} /><h3 className="font-bold text-[#001a33]">Aparelhos vinculados</h3></div>
        {detail.dispositivos.length ? <div className="grid gap-4 xl:grid-cols-2">{detail.dispositivos.map((device, index) => <div key={device.id}><DeviceCard device={device} index={index} /></div>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">Este aluno ainda não instalou o aplicativo.</div>}
      </section>

      <section className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><div className="flex items-center gap-2"><History className="text-violet-600" size={19} /><h3 className="font-bold text-[#001a33]">Histórico do aplicativo</h3></div><p className="mt-1 text-xs font-medium text-slate-500">Instalações, sessões e mudanças no consentimento, sem exibir tokens ou credenciais do aparelho.</p></div>
        {eventsQuery.isLoading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={25} /></div> : !eventsQuery.data?.length ? <div className="p-8 text-center text-sm font-semibold text-slate-500">Nenhum evento registrado.</div> : <ol className="divide-y divide-slate-100">{eventsQuery.data.map((event) => {
          const presentation = eventPresentation(event);
          const Icon = presentation.icon;
          return <li key={event.id} className="flex gap-4 p-5"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${presentation.tone}`}><Icon size={19} /></div><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><h4 className="font-bold text-[#001a33]">{presentation.title}</h4><time className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><Clock3 size={13} />{formatDate(event.createdAt)}</time></div><p className="mt-1 text-sm font-medium text-slate-600">{presentation.description}</p><p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">{event.platform}{event.deviceModel ? ` · ${event.deviceModel}` : ''}{event.appVersion ? ` · v${event.appVersion}` : ''}</p></div></li>;
        })}</ol>}
      </section>
    </div>
  );
};

export default AlunoAppDeviceDetail;
