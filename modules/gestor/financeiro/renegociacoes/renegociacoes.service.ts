import { supabase } from '../../../../lib/supabase';
import {
  isMissingRenegociacaoRpc,
  parseCandidateItems,
  parseMutationResult,
  parsePreview,
  parseProposalDetail,
  parseProposalPage,
  parseReadiness,
} from './renegociacoes.model';
import { parseCandidatePageV2 } from './renegociacoes.candidates';
import { withRenegociacaoReadDeadline } from './renegociacoes.read-request';
import { buildDiscardRpcArgs, buildPreviewRpcArgs, buildSaveRpcArgs } from './renegociacoes.payloads';
import type {
  DiscardRenegociacaoProposalInput,
  PreviewRenegociacaoInput,
  RenegociacaoCandidateFilters,
  RenegociacaoLifecycleStatus,
  SaveRenegociacaoProposalInput,
} from './renegociacoes.types';

export { buildDiscardRpcArgs, buildPreviewRpcArgs, buildSaveRpcArgs } from './renegociacoes.payloads';

const withSignal = <T extends { abortSignal: (signal: AbortSignal) => T }>(request: T, signal?: AbortSignal) => {
  if (signal) request.abortSignal(signal);
  return request;
};

export const renegociacoesService = {
  async readiness(poloId?: string | null, signal?: AbortSignal) {
    const request = supabase.rpc('get_receivable_renegotiation_readiness_secure', { p_polo_id: poloId || null });
    const { data, error } = await withSignal(request, signal);
    if (error) {
      if (isMissingRenegociacaoRpc(error))
        return {
          availability: 'NOT_APPLIED' as const,
          message: 'Renegociações ainda não está disponível neste ambiente.',
        };
      throw error;
    }
    return parseReadiness(data);
  },

  async listCandidates(
    poloId: string | null | undefined,
    search: string,
    page: number,
    signal?: AbortSignal,
    filters?: RenegociacaoCandidateFilters,
  ) {
    const request = supabase.rpc('list_receivable_renegotiation_candidate_groups_v2_secure', {
      p_polo_id: poloId || null,
      p_search: search.trim() || null,
      p_page: page,
      p_page_size: 20,
      p_as_of: null,
      p_course_type: filters?.courseType || null,
      p_turma_id: filters?.turmaId || null,
    });
    const { data, error } = await withRenegociacaoReadDeadline(request, signal);
    if (error) throw error;
    return parseCandidatePageV2(data);
  },

  async listCandidateItems(matriculaId: string, asOf?: string | null, signal?: AbortSignal) {
    const request = supabase.rpc('list_receivable_renegotiation_candidate_items_secure', {
      p_matricula_id: matriculaId,
      p_as_of: asOf || null,
    });
    const { data, error } = await withRenegociacaoReadDeadline(request, signal);
    if (error) throw error;
    return parseCandidateItems(data);
  },

  async preview(input: PreviewRenegociacaoInput, signal?: AbortSignal) {
    const request = supabase.rpc('preview_receivable_renegotiation_secure', buildPreviewRpcArgs(input));
    const { data, error } = await withSignal(request, signal);
    if (error) throw error;
    return parsePreview(data);
  },

  async save(input: SaveRenegociacaoProposalInput) {
    const { data, error } = await supabase.rpc(
      'save_receivable_renegotiation_proposal_secure',
      buildSaveRpcArgs(input),
    );
    if (error) throw error;
    return parseMutationResult(data);
  },

  async listProposals(
    poloId: string | null | undefined,
    status: RenegociacaoLifecycleStatus,
    search: string,
    page: number,
    signal?: AbortSignal,
  ) {
    const request = supabase.rpc('list_receivable_renegotiation_proposals_secure', {
      p_polo_id: poloId || null,
      p_search: search.trim() || null,
      p_status: status,
      p_page: page,
      p_page_size: 20,
    });
    const { data, error } = await withSignal(request, signal);
    if (error) throw error;
    return parseProposalPage(data);
  },

  async getProposal(agreementId: string, signal?: AbortSignal) {
    const request = supabase.rpc('get_receivable_renegotiation_proposal_secure', { p_agreement_id: agreementId });
    const { data, error } = await withSignal(request, signal);
    if (error) throw error;
    return parseProposalDetail(data);
  },

  async discard(input: DiscardRenegociacaoProposalInput) {
    const { data, error } = await supabase.rpc(
      'discard_receivable_renegotiation_proposal_secure',
      buildDiscardRpcArgs(input),
    );
    if (error) throw error;
    return parseMutationResult(data);
  },
};
