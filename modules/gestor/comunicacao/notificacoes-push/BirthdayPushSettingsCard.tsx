import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarHeart, Clock3, Loader2, Save, ShieldCheck } from 'lucide-react';
import PushImagePicker from './PushImagePicker';
import { pushNotificationKeys, pushNotificationService } from './notificacoes-push.service';
import type { PushBirthdaySettings, PushImageAsset } from './notificacoes-push.types';

type Props = {
  onSuccess: (title: string, message: string) => void;
  onError: (title: string, message: string) => void;
};

const DEFAULT_SETTINGS: PushBirthdaySettings = {
  enabled: false,
  title: '🎉 Feliz aniversário!',
  body: 'A Universo deseja a você um dia muito especial e um novo ciclo de muitas conquistas.',
  sendTime: '08:00',
  timezone: 'America/Maceio',
  imageAssetId: null,
  imagePath: null,
  imageUrl: null,
  updatedAt: null,
};

const errorMessage = (error: unknown) => error instanceof Error
  ? error.message
  : 'Não foi possível salvar a configuração.';

const BirthdayPushSettingsCard = ({ onSuccess, onError }: Props) => {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: pushNotificationKeys.birthdaySettings,
    queryFn: pushNotificationService.getBirthdaySettings,
    staleTime: 60_000,
  });
  const [draft, setDraft] = useState(DEFAULT_SETTINGS);
  const [image, setImage] = useState<PushImageAsset | null>(null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setDraft(settingsQuery.data);
    setImage(settingsQuery.data.imageAssetId && settingsQuery.data.imagePath && settingsQuery.data.imageUrl
      ? {
        id: settingsQuery.data.imageAssetId,
        purpose: 'birthday',
        objectPath: settingsQuery.data.imagePath,
        publicUrl: settingsQuery.data.imageUrl,
        mimeType: settingsQuery.data.imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
        sizeBytes: 0,
        width: 0,
        height: 0,
      }
      : null);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: pushNotificationService.updateBirthdaySettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(pushNotificationKeys.birthdaySettings, settings);
      onSuccess('Aniversário configurado', settings.enabled
        ? `Agenda salva para ${settings.sendTime}. O envio respeitará a política geral de push e o consentimento de cada aluno.`
        : 'O envio automático de aniversário está desativado.');
    },
    onError: (error) => onError('Não foi possível salvar', errorMessage(error)),
  });

  const canSave = draft.title.trim().length > 0
    && draft.body.trim().length > 0
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.sendTime)
    && (!draft.enabled || Boolean(image));

  if (settingsQuery.isLoading) {
    return <div className="flex min-h-48 items-center justify-center rounded-[1.75rem] border border-slate-200 bg-white"><Loader2 size={24} className="animate-spin text-pink-600" /></div>;
  }

  if (settingsQuery.isError) {
    return (
      <div className="rounded-[1.75rem] border border-rose-100 bg-rose-50 p-6">
        <p className="font-black text-rose-800">Configuração de aniversário indisponível</p>
        <p className="mt-1 text-sm font-semibold text-rose-700/80">{errorMessage(settingsQuery.error)}</p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-pink-100 bg-white shadow-sm">
      <header className="flex flex-col gap-4 border-b border-pink-100 bg-[linear-gradient(135deg,#fff1f7,#fff)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-100 text-pink-700"><CalendarHeart size={21} /></span>
          <div>
            <h2 className="text-lg font-black text-[#001a33]">Felicitação automática de aniversário</h2>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">Configure uma foto padrão e a frase. O banco identifica os aniversariantes e evita envio duplicado por aluno e ano.</p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-3 self-start rounded-xl border border-pink-100 bg-white px-3 py-2.5 text-xs font-black text-slate-700 sm:self-center">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
            className="h-4 w-4 accent-pink-600"
          />
          Envio automático
        </label>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px] sm:p-6">
        <div className="space-y-4">
          <label className="block text-xs font-bold text-slate-600">Título
            <input
              value={draft.title}
              maxLength={80}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-pink-400 focus:bg-white focus:ring-4 focus:ring-pink-50"
            />
          </label>
          <label className="block text-xs font-bold text-slate-600">Mensagem
            <textarea
              value={draft.body}
              maxLength={180}
              rows={4}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-700 outline-none focus:border-pink-400 focus:bg-white focus:ring-4 focus:ring-pink-50"
            />
          </label>
          <label className="block max-w-xs text-xs font-bold text-slate-600">Horário em Maceió
            <span className="relative mt-2 block">
              <Clock3 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="time"
                value={draft.sendTime}
                onChange={(event) => setDraft((current) => ({ ...current, sendTime: event.target.value }))}
                className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-bold text-slate-700 outline-none focus:border-pink-400"
              />
            </span>
          </label>
          <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-800">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            Somente alunos ativos, com matrícula elegível, push habilitado e consentimento para novidades recebem. A categoria Marketing também precisa estar habilitada na política geral de push. Nascidos em 29/02 recebem em 28/02 nos anos não bissextos.
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Foto padrão obrigatória</p>
          <PushImagePicker purpose="birthday" value={image} onChange={setImage} />
          {draft.enabled && !image ? <p className="mt-2 text-xs font-bold text-rose-600">Adicione a foto antes de ativar.</p> : null}
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs font-semibold text-slate-500">A agenda e a seleção dos alunos são calculadas no backend.</p>
        <button
          type="button"
          disabled={!canSave || saveMutation.isPending}
          onClick={() => saveMutation.mutate({
            enabled: draft.enabled,
            title: draft.title,
            body: draft.body,
            sendTime: draft.sendTime,
            imageAssetId: image?.id || null,
          })}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-pink-600 px-5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-pink-200 transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar aniversário
        </button>
      </footer>
    </section>
  );
};

export default BirthdayPushSettingsCard;
