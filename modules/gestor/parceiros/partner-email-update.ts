import type { CorrectPartnerEmailPayload, CorrectPartnerEmailResult, InviteStudentResult, PartnerGoogleIdentityStatus } from './portal-activation.service';

export interface PartnerEmailRecord extends Record<string, unknown> {
  id: string; tipo: string; email?: string | null; authUserId?: string | null; authLoginEmail?: string | null;
  senhaAtualizadaEm?: string | null; acessoStatus?: string | null; trocaSenhaObrigatoria?: boolean | null;
  primeiroAcessoInstitucionalPendente?: boolean | null;
  emailUpdateResult?: PartnerEmailUpdateResult;
}
export interface PartnerEmailUpdateResult {
  emailCorrected: boolean; loginEmailChanged: boolean; emailSent: boolean; deliveryPending: boolean; message: string;
}
interface Dependencies {
  getCurrent: (id: string) => Promise<PartnerEmailRecord>;
  getIdentity: (id: string) => Promise<PartnerGoogleIdentityStatus>;
  correct: (payload: CorrectPartnerEmailPayload) => Promise<CorrectPartnerEmailResult>;
  save: (id: string, data: Record<string, unknown>, omitEmail: boolean) => Promise<PartnerEmailRecord>;
  ensureStudent: (id: string, email: string) => Promise<InviteStudentResult>;
  ensureProfessor: (partner: PartnerEmailRecord) => Promise<PartnerEmailRecord>;
  uuid?: () => string;
}
export const normalizePartnerEmail = (value: unknown) => String(value || '').trim().toLowerCase();
export const canCorrectPendingPartnerEmail = (partner: PartnerEmailRecord) => Boolean(partner.authUserId) && (
  partner.tipo === 'Professor' ? partner.primeiroAcessoInstitucionalPendente === true
    : partner.tipo === 'Aluno' && !partner.senhaAtualizadaEm && String(partner.acessoStatus || '').toLowerCase() !== 'ativo' && partner.trocaSenhaObrigatoria === true
);

export class PartnerEmailPartialSaveError extends Error {
  readonly emailUpdateResult: PartnerEmailUpdateResult;
  readonly partnerId: string;
  constructor(partnerId: string, result: PartnerEmailUpdateResult, cause: unknown) {
    const delivery = result.emailSent ? 'O link foi enviado.' : result.deliveryPending ? 'O envio do link ficou pendente.' : result.message;
    super(`O e-mail já foi corrigido. ${delivery} Os demais dados não foram salvos. ${cause instanceof Error ? cause.message : 'Revise os dados e tente novamente.'}`);
    this.name = 'PartnerEmailPartialSaveError'; this.partnerId = partnerId; this.emailUpdateResult = result;
  }
}

/** Auth changes use the guarded endpoint before an ordinary profile update.
 * A duplicate save shares the same request; another draft cannot race this one.
 */
export function createPartnerEmailUpdater(deps: Dependencies) {
  const active = new Map<string, { signature: string; result: Promise<PartnerEmailRecord> }>();
  const corrections = new Map<string, CorrectPartnerEmailPayload>();
  const perform = async (id: string, data: Record<string, unknown>) => {
    if (data.id !== undefined && data.id !== id) throw new Error('O rascunho não corresponde à pessoa selecionada.');
    const hasEmail = Object.hasOwn(data, 'email');
    const current = hasEmail ? await deps.getCurrent(id) : null;
    if (current && current.id !== id) throw new Error('O cadastro retornado não corresponde à pessoa selecionada.');
    const email = normalizePartnerEmail(data.email), previousEmail = normalizePartnerEmail(current?.email);
    const emailChanged = Boolean(current && email !== previousEmail);
    let emailUpdateResult: PartnerEmailUpdateResult | undefined;
    let pendingCorrection = corrections.get(id);
    if (pendingCorrection && current?.authUserId === pendingCorrection.expectedAuthUserId
      && current.senhaAtualizadaEm && previousEmail === pendingCorrection.email
      && normalizePartnerEmail(current.authLoginEmail) === pendingCorrection.email) {
      corrections.delete(id); pendingCorrection = undefined;
    }
    if (pendingCorrection && hasEmail && pendingCorrection.email !== email) {
      throw new Error('Uma correção anterior ainda não foi conferida. Salve novamente o mesmo e-mail antes de enviar outro endereço.');
    }
    const correctEmail = async (payload: CorrectPartnerEmailPayload) => {
      corrections.set(id, payload);
      try {
        const corrected = await deps.correct(payload);
        if (corrected.emailSent && !corrected.deliveryPending) corrections.delete(id);
        return { emailCorrected: corrected.emailCorrected, loginEmailChanged: corrected.loginEmailChanged,
          emailSent: corrected.emailSent, deliveryPending: corrected.deliveryPending, message: corrected.message };
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status && [400, 401, 403, 404, 409, 422].includes(status)) corrections.delete(id);
        throw error;
      }
    };
    if (pendingCorrection && hasEmail) {
      if (current?.authUserId !== pendingCorrection.expectedAuthUserId) throw new Error('A identidade deste cadastro mudou. Atualize os dados antes de conferir a correção anterior.');
      emailUpdateResult = await correctEmail(pendingCorrection);
    }
    if (current?.tipo === 'Professor' && current.authUserId && emailChanged && !canCorrectPendingPartnerEmail(current)) {
      throw new Error('O e-mail de acesso já existente deste professor foi preservado. A correção de primeiro acesso não está disponível para esta conta.');
    }
    if (!emailUpdateResult && current && canCorrectPendingPartnerEmail(current) && email
      && (emailChanged || normalizePartnerEmail(current.authLoginEmail) !== email)) {
      const identity = await deps.getIdentity(id), expectedAuthEmail = normalizePartnerEmail(identity.email);
      if (!identity.has_auth_user || !expectedAuthEmail) throw new Error('Não foi possível conferir a identidade de acesso. Atualize o cadastro antes de corrigir o e-mail.');
      if (emailChanged || expectedAuthEmail !== email) {
        emailUpdateResult = await correctEmail({ partnerId: id, email, expectedEmail: current.email || null,
          expectedAuthUserId: current.authUserId!, expectedAuthEmail, requestId: (deps.uuid || (() => crypto.randomUUID()))() });
      }
    }
    let updated: PartnerEmailRecord;
    try { updated = await deps.save(id, hasEmail ? { ...data, email } : data, Boolean(emailUpdateResult)); }
    catch (error) { if (emailUpdateResult) throw new PartnerEmailPartialSaveError(id, emailUpdateResult, error); throw error; }
    if (emailUpdateResult) return { ...updated, emailUpdateResult };
    if (current?.tipo === 'Aluno' && current.authUserId && emailChanged) {
      return { ...updated, emailUpdateResult: { emailCorrected: false, loginEmailChanged: false, emailSent: false, deliveryPending: false,
        message: 'O e-mail de contato foi atualizado. O e-mail de acesso e a senha já existentes foram preservados.' } };
    }
    if (updated.tipo === 'Professor') return deps.ensureProfessor(updated);
    if (updated.tipo === 'Aluno' && !current?.authUserId && emailChanged && email) {
      try {
        const access = await deps.ensureStudent(id, email);
        const emailSent = Boolean(access.inviteSent || access.recoveryEmailSent);
        emailUpdateResult = { emailCorrected: false, loginEmailChanged: false,
          emailSent, deliveryPending: !emailSent && Boolean(access.studentAccessPending),
          message: access.message || 'O e-mail foi salvo e a preparação do acesso foi conferida.' };
      } catch (error) {
        emailUpdateResult = { emailCorrected: false, loginEmailChanged: false, emailSent: false, deliveryPending: true,
          message: `O e-mail foi salvo, mas a preparação do acesso ficou pendente. ${error instanceof Error ? error.message : 'Tente novamente pela área de acesso.'}` };
      }
    }
    return emailUpdateResult ? { ...updated, emailUpdateResult } : updated;
  };
  return (id: string, data: Record<string, unknown>) => {
    const signature = JSON.stringify(data), running = active.get(id);
    if (running) return running.signature === signature ? running.result : Promise.reject(new Error('Aguarde a gravação em andamento antes de enviar outra alteração.'));
    const result = perform(id, data).finally(() => { if (active.get(id)?.result === result) active.delete(id); });
    active.set(id, { signature, result }); return result;
  };
}
