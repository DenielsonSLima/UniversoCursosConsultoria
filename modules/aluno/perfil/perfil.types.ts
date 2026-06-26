export interface PerfilPageProps {
  alunoId: string;
}

export type PerfilTabId = 'perfil' | 'documentos' | 'google' | 'senha';

export type PerfilData = any;

export interface PerfilDocumento {
  id?: string;
  nome: string;
  status?: string | null;
  arquivoUrl?: string | null;
  observacao?: string | null;
}

export interface PerfilUpdatePayload {
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  dataNascimento: string;
  sexo: string;
  estadoCivil: string;
  nacionalidade: string;
  naturalidade: string;
  tipoDocumento: string;
  rg: string;
  orgaoEmissor: string;
  rgUfEmissao: string;
  rgDataEmissao: string;
  nomeMae: string;
  nomePai: string;
  escolaridadeAnterior: string;
  instituicaoOrigem: string;
  anoConclusaoEnsinoMedio: string;
  responsavelNome: string;
  responsavelCpf: string;
  responsavelParentesco: string;
  responsavelTelefone: string;
  responsavelEmail: string;
  responsavelFinanceiro: boolean;
}
