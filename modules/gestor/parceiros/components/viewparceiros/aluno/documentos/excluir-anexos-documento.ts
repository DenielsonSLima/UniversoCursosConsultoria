import type { DocumentoAlunoChecklistItem } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';

interface ExclusaoInput {
  arquivoIds: string[];
  motivo: string;
  documentoId?: string;
  versaoAtualId?: string;
}
interface ExclusaoService {
  arquivar: (versaoId: string, motivo: string) => Promise<unknown>;
  excluirArquivos: (arquivoIds: string[], motivo: string) => Promise<unknown>;
}

export async function excluirAnexosDocumento(
  input: ExclusaoInput,
  itens: DocumentoAlunoChecklistItem[],
  service: ExclusaoService,
) {
  const ids = [...new Set(input.arquivoIds)];
  const ativos = itens.filter((item) => item.versaoAtual?.fontes.some(
    (source) => ids.includes(source.arquivo.id),
  ));
  if (ativos.some((item) => item.id !== input.documentoId)) {
    throw new Error('Este anexo também pertence a outro documento ativo. Arquive os documentos relacionados antes de excluir o arquivo compartilhado.');
  }
  const versao = ativos.find((item) => item.id === input.documentoId)?.versaoAtual;
  if (!input.versaoAtualId) {
    if (versao) throw new Error('Este arquivo pertence à versão atual. Use Excluir anexo no checklist ou arquive a versão antes de excluir pelo Histórico.');
    return service.excluirArquivos(ids, input.motivo);
  }
  if (!versao || versao.id !== input.versaoAtualId
    || ids.some((id) => !versao.fontes.some((source) => source.arquivo.id === id))) {
    throw new Error('A versão atual mudou. Feche esta janela e confira o checklist antes de excluir.');
  }
  await service.arquivar(versao.id, input.motivo);
  try {
    return await service.excluirArquivos(ids, input.motivo);
  } catch {
    throw new Error('Versão arquivada, exclusão não concluída. Use o Histórico para tentar novamente.');
  }
}
