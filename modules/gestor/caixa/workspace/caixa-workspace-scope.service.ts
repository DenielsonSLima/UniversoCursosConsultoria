import { supabase } from '../../../../lib/supabase.ts';

export interface CaixaWorkspaceResolvedScope {
  empresaId: string;
  poloIds: string[];
}

interface PoloScopeRow {
  id: string;
  company_id: string | null;
}

export const resolveCaixaWorkspaceScope = async (
  poloId: string,
): Promise<CaixaWorkspaceResolvedScope> => {
  const { data: polo, error: poloError } = await supabase
    .from('polos')
    .select('id, company_id')
    .eq('id', poloId)
    .maybeSingle<PoloScopeRow>();

  if (poloError) throw poloError;
  if (!polo?.company_id) {
    throw new Error('O polo selecionado não possui empresa vinculada.');
  }

  const { data: companyPolos, error: companyPolosError } = await supabase
    .from('polos')
    .select('id, company_id')
    .eq('company_id', polo.company_id)
    .eq('status', 'ativo')
    .returns<PoloScopeRow[]>();

  if (companyPolosError) throw companyPolosError;

  return {
    empresaId: polo.company_id,
    poloIds: (companyPolos ?? []).map((item) => item.id),
  };
};
