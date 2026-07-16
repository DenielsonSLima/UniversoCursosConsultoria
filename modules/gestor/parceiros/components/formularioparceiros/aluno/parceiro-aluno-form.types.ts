import type React from 'react';

export interface AlunoFormData {
  poloId: string;
  status: string;
  foto: string;
  nomeCompleto: string;
  nomeSocial: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  racaCor: string;
  estadoCivil: string;
  nacionalidade: string;
  naturalidade: string;
  pcd: boolean;
  pcdTipo: string;
  tipoDocumento: string;
  rg: string;
  orgaoEmissor: string;
  rgUfEmissao: string;
  rgDataEmissao: string;
  certidaoTipo: string;
  certidaoModelo: string;
  certidaoMatricula: string;
  certidaoTermo: string;
  certidaoLivro: string;
  certidaoFolha: string;
  tituloEleitor: string;
  reservista: string;
  nomeMae: string;
  nomePai: string;
  responsavelNome: string;
  responsavelCpf: string;
  responsavelParentesco: string;
  responsavelTelefone: string;
  responsavelEmail: string;
  responsavelFinanceiro: boolean;
  escolaridadeAnterior: string;
  instituicaoOrigem: string;
  anoConclusaoEnsinoMedio: string;
  situacaoEnsinoMedio: string;
  serieEnsinoMedioAtual: string;
  escolaEnsinoMedio: string;
  anoPrevisaoConclusaoEnsinoMedio: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  email: string;
  contato1: string;
  contato2: string;
  observacao: string;
}

export type AlunoFormChangeHandler = (
  event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
) => void;

export interface AlunoFormStepProps {
  formData: AlunoFormData;
  onChange: AlunoFormChangeHandler;
}

export interface PoloOption {
  id: string;
  nome: string;
  cidade?: string | null;
  estado?: string | null;
  uf?: string | null;
}
