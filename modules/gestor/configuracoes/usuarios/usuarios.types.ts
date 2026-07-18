import { GestorPermissions } from '../../access-control';
import { PortalScheduleRestriction } from '../../../login/portal-schedule';

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
  permissoes: GestorPermissions;
  perfil_acesso_id?: string | null;
  perfil_nome?: string | null;
  personalizar_permissoes?: boolean;
  restricao_horario?: PortalScheduleRestriction | null;
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
  perfil_acesso_id?: string | null;
  personalizar_permissoes?: boolean;
  restricao_horario?: PortalScheduleRestriction | null;
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
  abasModulos: Record<string, string[]>;
  perfil_acesso_id?: string | null;
  personalizarPermissoes: boolean;
  personalizarHorario: boolean;
  horarioAtivo: boolean;
  diasHorario: number[];
  horarioInicio: string;
  horarioFim: string;
}
