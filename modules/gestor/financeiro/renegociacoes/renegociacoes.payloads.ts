import type {
  DiscardRenegociacaoProposalInput,
  PreviewRenegociacaoInput,
  SaveRenegociacaoProposalInput,
} from './renegociacoes.types';

export const buildPreviewRpcArgs = (input: PreviewRenegociacaoInput) => ({
  p_receivable_ids: input.receivableIds,
  p_terms: input.terms,
  p_policy_overrides: input.policyOverrides,
  p_as_of: input.asOf || null,
});

export const buildSaveRpcArgs = (input: SaveRenegociacaoProposalInput) => ({
  p_request_id: input.requestId,
  p_receivable_ids: input.receivableIds,
  p_expected_proposal_fingerprint: input.expectedProposalFingerprint,
  p_terms: input.terms,
  p_policy_overrides: input.policyOverrides,
  p_as_of: input.asOf || null,
  p_submit: input.submit,
  p_reason: input.reason?.trim() || null,
});

export const buildDiscardRpcArgs = (input: DiscardRenegociacaoProposalInput) => ({
  p_request_id: input.requestId,
  p_agreement_id: input.agreementId,
  p_expected_version: input.expectedVersion,
  p_expected_fingerprint: input.expectedFingerprint,
  p_reason: input.reason.trim(),
});
