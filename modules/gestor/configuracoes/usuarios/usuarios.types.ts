import { GestorPermissions } from '../../access-control';

export interface UsuarioSistema {
  id?: string;
  nome: string;
  email: string;
  cpf?: string;
  telefone?: string;
  perfil: string;
  status: 'Ativo' | 'Inativo';
  context: string;
  polo_ids?: string[];
  permissoes?: GestorPermissions;
  created_at?: string;
}

export interface UsuarioSistemaInput {
  nome: string;
  email: string;
  senha?: string;
  cpf?: string;
  telefone?: string;
  perfil: string;
  status: 'Ativo' | 'Inativo';
  context: string;
  polo_ids: string[];
  permissoes: GestorPermissions;
}

export interface NovoUsuarioFormData {
  nome: string;
  sobrenome: string;
  cpf: string;
  dataNascimento: string;
  telefone: string;
  email: string;
  senha: string;
  confirmarSenha: string;
  todosPolos: boolean;
  polosAcesso: string[];
  permissoes: string[];
  financeiroAbas: string[];
}
