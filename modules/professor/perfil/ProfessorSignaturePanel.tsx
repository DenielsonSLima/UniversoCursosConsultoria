import React, { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ImageUp,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../gestor/components/ToastNotification';
import { assinaturasRegistryService } from '../../gestor/configuracoes/assinaturas/assinaturas-registry.service';

interface ProfessorSignaturePanelProps {
  professorId: string;
  professorName: string;
}

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const ProfessorSignaturePanel: React.FC<ProfessorSignaturePanelProps> = ({
  professorId,
  professorName,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();

  const signatureQuery = useQuery({
    queryKey: ['signatures', 'professor', professorId],
    queryFn: () => assinaturasRegistryService.getProfessorSignature(professorId),
    enabled: Boolean(professorId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      assinaturasRegistryService.uploadMyProfessorSignature(professorId, file),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['signatures', 'professor', professorId] }),
        queryClient.invalidateQueries({ queryKey: ['signatures', 'list', 'PROFESSOR'] }),
      ]);
      toast.success(
        'Assinatura vinculada',
        'Sua assinatura foi vinculada ao cadastro de professor.',
        {
          avatarName: professorName,
          contextLabel: 'Meu perfil de professor',
        },
      );
    },
    onError: (error) => toast.error(
      'Assinatura não enviada',
      error instanceof Error ? error.message : 'Revise a imagem e tente novamente.',
      {
        avatarName: professorName,
        contextLabel: 'Meu perfil de professor',
      },
    ),
  });

  const signature = signatureQuery.data;
  const updatedAt = formatUpdatedAt(signature?.updatedAt);
  const hasSignature = Boolean(
    signature?.signaturePath
    || signature?.signatureUrl
    || signature?.previewUrl,
  );

  const openFilePicker = () => {
    if (!hasSignature && !uploadMutation.isPending) {
      inputRef.current?.click();
    }
  };

  return (
    <>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="pt-6">
        <div className="mb-5">
          <h4 className="text-sm font-extrabold uppercase tracking-tight text-[#001a33]">Minha Assinatura</h4>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-600">
            Envie sua assinatura uma única vez. Depois de vinculada, somente a gestão poderá alterá-la ou excluí-la.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="flex min-h-64 items-center justify-center bg-[linear-gradient(135deg,#f8fafc,#faf5ff)] p-6 sm:p-8">
              {signatureQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <Loader2 size={18} className="animate-spin text-purple-600" />
                  Carregando assinatura...
                </div>
              ) : signatureQuery.isError ? (
                <button
                  type="button"
                  onClick={() => signatureQuery.refetch()}
                  className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  <RefreshCw size={15} />
                  Tentar carregar novamente
                </button>
              ) : signature?.previewUrl ? (
                <img
                  src={signature.previewUrl}
                  alt={`Assinatura de ${professorName}`}
                  className="max-h-36 max-w-full object-contain mix-blend-multiply"
                />
              ) : (
                <div className="w-full max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-100 bg-white text-purple-700 shadow-sm">
                    <ImageUp size={25} strokeWidth={1.8} />
                  </div>
                  <p className="text-base font-extrabold text-[#001a33]">Adicione sua assinatura em imagem</p>
                  <p className="mx-auto mt-2 max-w-sm text-[13px] font-medium leading-relaxed text-slate-600">
                    Use uma imagem nítida, com fundo branco ou transparente e recortada próxima ao traço.
                  </p>
                  <button
                    type="button"
                    onClick={openFilePicker}
                    disabled={uploadMutation.isPending}
                    className="mx-auto mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#6d28d9] px-6 py-3 text-sm font-bold text-white shadow-md shadow-purple-900/15 transition hover:bg-[#5b21b6] focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Upload size={18} />
                    )}
                    {uploadMutation.isPending ? 'Enviando assinatura...' : 'Selecionar imagem da assinatura'}
                  </button>
                  <p className="mt-3 text-[11px] font-medium text-slate-500">
                    PNG, JPG ou WEBP • tamanho máximo de 2 MB
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-extrabold text-[#001a33]">{professorName}</p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  {updatedAt ? `Vinculada em ${updatedAt}` : 'Aguardando o primeiro envio'}
                </p>
              </div>
              {hasSignature ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 size={17} />
                  Assinatura vinculada
                </div>
              ) : (
                <span className="text-xs font-medium text-slate-500">
                  O envio fica disponível somente enquanto não houver assinatura.
                </span>
              )}
            </div>

            {!hasSignature ? (
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploadMutation.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) uploadMutation.mutate(file);
                }}
                className="sr-only"
              />
            ) : null}
          </section>

          <aside className="space-y-3">
            <div className="rounded-3xl border border-purple-100 bg-purple-50/60 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-purple-700 shadow-sm">
                <ShieldCheck size={19} />
              </div>
              <h5 className="text-sm font-extrabold text-[#001a33]">Arquivo protegido</h5>
              <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-600">
                A imagem fica em armazenamento privado e só é exibida por um acesso temporário autorizado.
              </p>
            </div>

            <div className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                <LockKeyhole size={19} />
              </div>
              <h5 className="text-sm font-extrabold text-[#001a33]">Alteração pela gestão</h5>
              <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-600">
                Após o primeiro envio, somente o gestor pode substituir ou excluir a imagem na Central de Assinaturas.
              </p>
            </div>

            <p className="px-2 text-[11px] font-medium leading-relaxed text-slate-500">
              Ao enviar, confirme que a imagem está correta e legível. Alterações futuras deverão ser solicitadas à gestão.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
};

export default ProfessorSignaturePanel;
