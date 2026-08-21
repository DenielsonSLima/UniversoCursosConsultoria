import type { CrachaTemplateField, CrachaTemplateModel } from '../../cracha/components/cracha-editor.model';

export type StatusModeloPreceptor = 'RASCUNHO' | 'ATIVO' | 'EM_REVISAO';
export type ModoValidadePreceptor = 'SEM_VENCIMENTO' | 'POR_DIAS';

export interface ConfiguracaoQrPreceptor {
  [key: string]: unknown;
  habilitado: boolean;
  rotulo: string;
  caminhoValidacao: string;
  modoValidade: ModoValidadePreceptor;
  diasValidade: number | null;
}

/**
 * A chave técnica permanece `carteirinha_preceptor`, porém o conteúdo usa o
 * mesmo contrato visual CR80 do crachá de estágio. Só tokens PRECEPTOR_* são
 * aceitos pela emissão oficial.
 */
export interface ConteudoModeloCarteirinhaPreceptor extends CrachaTemplateModel {
  layoutVersion?: string;
  nomeModelo: string;
  tituloFrente: string;
  subtituloFrente: string;
  mensagemVerso: string;
  rodape: string;
  mostrarFoto: boolean;
  mostrarPolo: boolean;
  marcaDaguaHabilitada: boolean;
  fields?: CrachaTemplateField[];
  qr: ConfiguracaoQrPreceptor;
}

export interface ModeloCarteirinhaPreceptorSeguro {
  templateKey: 'carteirinha_preceptor';
  revisao: number;
  status: StatusModeloPreceptor;
  atualizadoEm: string | null;
  atualizadoPorNome: string | null;
  conteudo: ConteudoModeloCarteirinhaPreceptor;
}

export interface SalvarModeloCarteirinhaPreceptorInput {
  revisaoEsperada: number;
  conteudo: ConteudoModeloCarteirinhaPreceptor;
  requestId: string;
}
