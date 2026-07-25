import {
  DocumentoAlunoChecklistItem,
  DocumentoAlunoPdfMapeamento,
  DocumentoAlunoResumo,
} from './documentos-aluno.types';

export const resumirDocumentosAluno = (
  itens: DocumentoAlunoChecklistItem[],
): DocumentoAlunoResumo => {
  const resumo: DocumentoAlunoResumo = {
    total: itens.length,
    naoEnviados: 0,
    pendentes: 0,
    aprovados: 0,
    recusados: 0,
    arquivados: 0,
  };

  for (const item of itens) {
    if (item.status === 'nao_enviado') resumo.naoEnviados += 1;
    if (item.status === 'pendente') resumo.pendentes += 1;
    if (item.status === 'aprovado') resumo.aprovados += 1;
    if (item.status === 'recusado') resumo.recusados += 1;
    if (item.status === 'arquivado') resumo.arquivados += 1;
  }

  return resumo;
};

export const validarMapeamentosPdf = (
  mapeamentos: DocumentoAlunoPdfMapeamento[],
  totalPaginas: number,
) => {
  const erros: Record<string, string> = {};
  const itemIds = new Set<string>();

  for (const mapeamento of mapeamentos) {
    if (!mapeamento.checklistItemId) {
      erros[mapeamento.id] = 'Selecione o documento.';
      continue;
    }
    if (itemIds.has(mapeamento.checklistItemId)) {
      erros[mapeamento.id] = 'Este item já possui um intervalo.';
      continue;
    }
    itemIds.add(mapeamento.checklistItemId);

    if (
      !Number.isInteger(mapeamento.paginaInicio)
      || !Number.isInteger(mapeamento.paginaFim)
      || mapeamento.paginaInicio < 1
      || mapeamento.paginaFim < mapeamento.paginaInicio
      || mapeamento.paginaFim > totalPaginas
    ) {
      erros[mapeamento.id] = `Use páginas entre 1 e ${totalPaginas}.`;
    }
  }

  return erros;
};

export const formatarTamanhoArquivo = (bytes?: number | null) => {
  if (!bytes || bytes < 1) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
};
