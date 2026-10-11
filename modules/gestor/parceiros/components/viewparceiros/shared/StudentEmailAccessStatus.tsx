import { CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react';

interface StudentEmailAccessStatusProps {
  isStudent: boolean;
  email?: string | null;
  emailConfirmed: boolean;
  emailValidatedByManager: boolean;
  confirmationStatus?: 'confirmed' | 'pending' | 'no_auth_user' | 'no_email' | 'unknown';
  isLoading: boolean;
  isConfirming: boolean;
  canConfirmEmail: boolean;
  onConfirmEmail: () => void;
}

const StudentEmailAccessStatus = ({
  isStudent,
  email,
  emailConfirmed,
  emailValidatedByManager,
  confirmationStatus,
  isLoading,
  isConfirming,
  canConfirmEmail,
  onConfirmEmail,
}: StudentEmailAccessStatusProps) => {
  const hasContactEmail = Boolean(String(email || '').trim());
  const confirmedForLogin = emailConfirmed && confirmationStatus === 'confirmed' && !isLoading;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-800">
        <Mail size={16} className="text-blue-600" />
        E-mail cadastral
      </h4>
      <input
        type="text"
        readOnly
        value={email || 'Não informado — acesso disponível pela matrícula'}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700"
      />

      {isStudent && (!hasContactEmail ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-700">
              Confirmação de e-mail não se aplica
            </p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
              O login será feito pela matrícula. Quando necessário, envie o link seguro de acesso por um canal confirmado, como o WhatsApp cadastrado.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                confirmedForLogin
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {confirmedForLogin ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Confirmação do e-mail para login
                </p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                  {isLoading
                    ? 'Verificando a confirmação do e-mail...'
                    : confirmationStatus === 'unknown' || !confirmationStatus
                      ? 'Não foi possível confirmar a situação do e-mail agora.'
                      : confirmedForLogin
                        ? 'E-mail confirmado para o acesso do aluno.'
                        : confirmationStatus === 'no_auth_user'
                          ? 'Prepare o acesso antes de confirmar este e-mail para login.'
                          : 'Confirmação para login pendente. Confirme somente após verificar que o aluno controla este endereço.'}
                </p>
                {emailValidatedByManager && (
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                    Canal validado pelo gestor.
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onConfirmEmail}
              disabled={!canConfirmEmail || isConfirming || isLoading}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConfirming && <Loader2 className="animate-spin" size={14} />}
              {confirmedForLogin ? 'E-mail confirmado' : emailValidatedByManager ? 'Confirmar e-mail' : 'Validar e-mail'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StudentEmailAccessStatus;
