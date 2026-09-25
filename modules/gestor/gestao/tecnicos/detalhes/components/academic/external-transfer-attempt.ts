import {
  isDefiniteTransferRejection,
  type ExternalTransferInput, type ExternalTransferResult,
} from './external-transfer.contract';

/** Keeps the exact request available until its commit outcome is known. */
export class ExternalTransferAttempt {
  private input: ExternalTransferInput | null = null;
  private completed: ExternalTransferResult | null = null;
  busy = false;
  uncertain = false;

  get hasInput() { return this.input !== null; }
  get canEdit() { return !this.busy && !this.uncertain && !this.completed; }
  get canClose() { return !this.busy && !this.uncertain; }

  async run(
    createInput: () => ExternalTransferInput,
    receive: (input: ExternalTransferInput) => Promise<ExternalTransferResult>,
  ): Promise<ExternalTransferResult | null> {
    if (this.busy) return null;
    if (this.completed) return this.completed;
    this.busy = true;
    try {
      if (!this.input) this.input = globalThis.structuredClone(createInput());
      const previousOutcomeUncertain = this.uncertain;
      try {
        this.completed = await receive(globalThis.structuredClone(this.input));
        this.uncertain = false;
        return this.completed;
      } catch (error) {
        // A rejected replay cannot prove that the earlier, lost response rolled back.
        this.uncertain = previousOutcomeUncertain || !isDefiniteTransferRejection(error);
        if (!this.uncertain) this.input = null;
        throw error;
      }
    } finally { this.busy = false; }
  }
}
