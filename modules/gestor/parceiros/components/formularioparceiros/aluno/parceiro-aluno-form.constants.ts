import { GraduationCap, Heart, Home, Shield, User } from 'lucide-react';

import type { AlunoFormData, PoloOption } from './parceiro-aluno-form.types';

export const STEPS = [
  { id: 1, label: 'Dados Pessoais', icon: User, color: 'blue' },
  { id: 2, label: 'Documentação', icon: Shield, color: 'indigo' },
  { id: 3, label: 'Filiação', icon: Heart, color: 'rose' },
  { id: 4, label: 'Escolaridade', icon: GraduationCap, color: 'emerald' },
  { id: 5, label: 'Endereço & Contato', icon: Home, color: 'violet' },
];

export const ESTADOS_CIVIS = ['SOLTEIRO(A)', 'CASADO(A)', 'DIVORCIADO(A)', 'VIÚVO(A)', 'UNIÃO ESTÁVEL', 'SEPARADO(A)'];
export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export const ESCOLARIDADES = ['ENSINO MÉDIO COMPLETO','ENSINO MÉDIO INCOMPLETO','CURSANDO ENSINO MÉDIO','ENSINO SUPERIOR COMPLETO','ENSINO SUPERIOR INCOMPLETO','PÓS-GRADUAÇÃO'];
export const PCD_TIPOS = ['FÍSICA','AUDITIVA','VISUAL','INTELECTUAL','MÚLTIPLA','TRANSTORNO DO ESPECTRO AUTISTA (TEA)'];
export const MATRIZ_POLO_ID = '44444444-4444-4444-4444-444444444444';

export const INPUT_CLS = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
export const LABEL_CLS = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5';
export const sectionHeaderCls = (color: string) => `flex items-center gap-2 text-${color}-600 border-b border-slate-100 pb-2 mb-5`;

export const createInitialFormData = (defaultPoloId?: string | null): AlunoFormData => ({
  poloId: defaultPoloId || MATRIZ_POLO_ID,
  status: 'ATIVO',
  foto: '',
  nomeCompleto: '',
  nomeSocial: '',
  cpf: '',
  dataNascimento: '',
  sexo: '',
  estadoCivil: '',
  nacionalidade: 'BRASILEIRA',
  naturalidade: '',
  pcd: false,
  pcdTipo: '',
  tipoDocumento: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
  rg: '',
  orgaoEmissor: '',
  rgUfEmissao: '',
  rgDataEmissao: '',
  tituloEleitor: '',
  reservista: '',
  nomeMae: '',
  nomePai: '',
  responsavelNome: '',
  responsavelCpf: '',
  responsavelParentesco: '',
  responsavelTelefone: '',
  responsavelEmail: '',
  responsavelFinanceiro: false,
  escolaridadeAnterior: '',
  instituicaoOrigem: '',
  anoConclusaoEnsinoMedio: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  email: '',
  contato1: '',
  contato2: '',
  observacao: '',
});

export const formatPoloOption = (polo: PoloOption) => {
  const cidadeUf = [polo.cidade, polo.estado || polo.uf].filter(Boolean).join('/');
  return cidadeUf ? `${polo.nome} - ${cidadeUf}` : polo.nome;
};
