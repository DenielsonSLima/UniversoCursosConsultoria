import { GestorPermissions } from '../../access-control';
import { PortalScheduleRestriction } from '../../../login/portal-schedule';

export type SetorComunicacao =
  | 'todos'
  | 'pedagogico_coordenacao'
  | 'financeiro'
  | 'comercial_matriculas'
  | 'secretaria'
  | 'atendimento_geral';

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
  setor_comunicacao?: SetorComunicacao | null;
  polo_comunicacao_id?: string | null;
  pode_visualizar_todos_polos?: boolean;
  pode_visualizar_todos_setores?: boolean;
  created_at?: string;
  access_message?: string;
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
  setor_comunicacao?: SetorComunicacao | null;
  polo_comunicacao_id?: string | null;
  pode_visualizar_todos_polos?: boolean;
  pode_visualizar_todos_setores?: boolean;
}

export interface UsuarioManagementState {
  userId: string;
  canDelete: boolean;
  canChangeStatus: boolean;
  hasActivity: boolean;
  reason: string | null;
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
  setorComunicacao: SetorComunicacao;
  poloComunicacaoId: string | null;
  podeVisualizarTodosPolos: boolean;
  podeVisualizarTodosSetores: boolean;
}
