import React, { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Loader2, LockKeyhole, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
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
        'Assinatura atualizada',
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

  return (
    <>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="pt-6">
        <div className="mb-5">
          <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Minha Assinatura</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Envie ou substitua a assinatura vinculada ao seu cadastro docente.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="flex min-h-56 items-center justify-center bg-[linear-gradient(135deg,#f8fafc,#faf5ff)] p-8">
              {signatureQuery.isLoading ? (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <Loader2 size={18} className="animate-spin text-purple-600" />
                  Carregando assinatura...
                </div>
              ) : signatureQuery.isError ? (
                <button
                  type="button"
                  onClick={() => signatureQuery.refetch()}
                  className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700"
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
                <div className="text-center text-slate-400">
                  <FileSignature size={42} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-black text-slate-600">Nenhuma assinatura enviada</p>
                  <p className="mt-1 text-xs font-semibold">Use uma imagem com fundo branco ou transparente.</p>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-black text-[#001a33]">{professorName}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                  {updatedAt ? `Atualizada em ${updatedAt}` : 'Ainda não vinculada'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="flex items-center justify-center gap-2 rounded-xl bg-purple-650 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {uploadMutation.isPending
                  ? 'Enviando'
                  : signature?.previewUrl
                    ? 'Substituir assinatura'
                    : 'Enviar assinatura'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) uploadMutation.mutate(file);
                }}
                className="sr-only"
              />
            </div>
          </section>

          <aside className="space-y-3">
            <div className="rounded-3xl border border-purple-100 bg-purple-50/60 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-purple-650 shadow-sm">
                <ShieldCheck size={19} />
              </div>
              <h5 className="text-sm font-black text-[#001a33]">Arquivo protegido</h5>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                A imagem fica em armazenamento privado e só é exibida por um acesso temporário autorizado.
              </p>
            </div>

            <div className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                <LockKeyhole size={19} />
              </div>
              <h5 className="text-sm font-black text-[#001a33]">Exclusão controlada</h5>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                Você pode enviar e substituir sua assinatura. A exclusão definitiva é realizada somente pelo gestor na Central de Assinaturas.
              </p>
            </div>

            <p className="px-2 text-[10px] font-semibold leading-relaxed text-slate-400">
              Formatos aceitos: PNG, JPG e WEBP, com até 2 MB. Prefira uma imagem nítida, sem sombras e recortada próxima ao traço.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
};

export default ProfessorSignaturePanel;
