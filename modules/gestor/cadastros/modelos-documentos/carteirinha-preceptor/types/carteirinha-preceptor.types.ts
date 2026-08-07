export type StatusModeloPreceptor = 'RASCUNHO' | 'ATIVO' | 'EM_REVISAO';
export type ModoValidadePreceptor = 'SEM_VENCIMENTO' | 'POR_DIAS';

export interface ConfiguracaoQrPreceptor {
  habilitado: boolean;
  rotulo: string;
  caminhoValidacao: string;
  modoValidade: ModoValidadePreceptor;
  diasValidade: number | null;
}

export interface ConteudoModeloCarteirinhaPreceptor {
  nomeModelo: string;
  tituloFrente: string;
  subtituloFrente: string;
  mensagemVerso: string;
  rodape: string;
  mostrarFoto: boolean;
  mostrarPolo: boolean;
  marcaDaguaHabilitada: boolean;
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
