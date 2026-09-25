import type { TransferFinancialResult, TransferIntent } from '../transfer-finance.contract';

export type TransferFinancialAttemptInput = TransferIntent & { requestId: string; fingerprint: string };
const definiteRejection = (error: unknown) => Boolean(error && typeof error === 'object'
  && 'code' in error && ['40001', '40P01', '22023', '23514', '42501', 'P0001', 'PT409', '23505', '55P03'].includes(String(error.code)));

/** A rejected replay never proves that a previous lost response rolled back. */
export class TransferFinancialAttempt {
  private input: TransferFinancialAttemptInput | null = null;
  private result: TransferFinancialResult | null = null;
  busy = false;
  uncertain = false;
  get hasInput() { return this.input !== null; }
  get confirmed() { return this.result !== null; }

  async run(
    createInput: () => TransferFinancialAttemptInput,
    confirm: (input: TransferFinancialAttemptInput) => Promise<TransferFinancialResult>,
  ): Promise<TransferFinancialResult | null> {
    if (this.busy) return null;
    if (this.result) return this.result;
    this.busy = true;
    try {
      if (!this.input) this.input = globalThis.structuredClone(createInput());
      const previousUncertainty = this.uncertain;
      try {
        this.result = await confirm(globalThis.structuredClone(this.input));
        this.uncertain = false;
        return this.result;
      } catch (error) {
        this.uncertain = previousUncertainty || !definiteRejection(error);
        if (!this.uncertain) this.input = null;
        throw error;
      }
    } finally { this.busy = false; }
  }
}
