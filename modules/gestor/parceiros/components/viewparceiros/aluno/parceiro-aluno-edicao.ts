/** Equivalências conhecidas; valores legados diferentes permanecem disponíveis. */
export const normalizeAlunoSexo = (value: unknown): string => {
  const original = String(value || '').trim().toUpperCase();
  if (original === 'F') return 'FEMININO';
  if (original === 'M') return 'MASCULINO';
  return original;
};

const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

/** Separa apenas o sufixo de UF reconhecido, sem descartar conteúdo conflitante. */
export const normalizeAlunoOrgao = (orgao: unknown, uf: unknown) => {
  const orgaoEmissor = String(orgao || '').trim().toUpperCase();
  const rgUfEmissao = String(uf || '').trim().toUpperCase();
  const match = orgaoEmissor.match(/^(.+?)\s*\/\s*([A-Z]{2})\s*\/?$/);
  if (match && UFS.has(match[2]) && (!rgUfEmissao || rgUfEmissao === match[2])) {
    return { orgaoEmissor: match[1].trim(), rgUfEmissao: match[2] };
  }
  return { orgaoEmissor, rgUfEmissao };
};

/** Trocar opções condicionais não apaga os valores que ainda estão no rascunho. */
export const updateAlunoDraft = <T extends Record<string, unknown>>(draft: T, name: string, value: unknown) => {
  const next = { ...draft, [name]: value };
  if (name === 'telefone' || name === 'contato1') {
    return { ...next, telefone: value, contato1: value };
  }
  if (name === 'nome') return { ...next, nomeCompleto: value };
  return next;
};

/** Limpa incompatíveis apenas após alteração de condição; conserva cadastros legados. */
export const prepareAlunoSaveData = <T extends Record<string, unknown>>(
  draft: T,
  baseline: Record<string, unknown>,
) => {
  const payload: Record<string, unknown> = { ...draft };
  if (draft.certidaoModelo !== baseline.certidaoModelo) {
    if (draft.certidaoModelo === 'NOVO') {
      Object.assign(payload, { certidaoTermo: '', certidaoLivro: '', certidaoFolha: '', certidao_termo: null, certidao_livro: null, certidao_folha: null });
    } else if (draft.certidaoModelo === 'ANTIGO') {
      Object.assign(payload, { certidaoMatricula: '', certidao_matricula: null });
    }
  }
  if (draft.situacaoEnsinoMedio !== baseline.situacaoEnsinoMedio) {
    if (draft.situacaoEnsinoMedio !== 'CONCLUIDO') payload.anoConclusaoEnsinoMedio = '';
    if (draft.situacaoEnsinoMedio !== 'CURSANDO') {
      Object.assign(payload, { serieEnsinoMedioAtual: '', anoPrevisaoConclusaoEnsinoMedio: '', anoPrevistoConclusaoEnsinoMedio: '' });
    }
  }
  return payload;
};
