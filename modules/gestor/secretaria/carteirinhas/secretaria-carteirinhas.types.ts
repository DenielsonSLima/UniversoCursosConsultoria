export interface Aluno {
  id: string;
  enrollmentId?: string;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  matricula: string;
  curso: string;
  instituicao: string;
  validade: string;
  fotoUrl?: string | null;
  tipoDocumento?: string;
  tipo_documento?: string;
  turmaIds?: string[];
  validationCode?: string;
  poloRazaoSocial?: string;
  poloCnpj?: string;
  poloTelefone?: string;
}
