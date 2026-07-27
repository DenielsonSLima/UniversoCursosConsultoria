
import React, { useState, useEffect } from 'react';
import { Save, X } from 'lucide-react';
import { formatCpf, isValidCpf, isValidEmail, normalizeEmail } from '../../../../shared/utils/identityValidation';
import {
  DEFAULT_FINANCEIRO_TABS,
  DEFAULT_GESTAO_TURMA_TABS,
  GESTOR_MODULE_IDS,
  GestorModuleId,
  normalizeGestorPermissions,
} from '../../../access-control';
import { useUsuariosPolosQuery } from '../hooks/useUsuariosConfigQueries';
import { NovoUsuarioFormData, UsuarioSistema } from '../usuarios.types';
import { perfisAcessoService, PerfilAcesso } from '../../perfis-acesso/perfis-acesso.service';
import UserAccessSections from './UserAccessSections';
import UserIdentitySections from './UserIdentitySections';
import { USER_FORM_MODULE_TABS } from './user-access-options';
import { normalizeSecretariaAccessTabs } from '../../../secretaria/secretaria-access';

interface UserFormAddProps {
  contextId: string;
  onSave: (data: NovoUsuarioFormData) => void;
  onCancel: () => void;
  initialUser?: UsuarioSistema;
}

const splitFullName = (fullName: string) => {
  const parts = String(fullName || '').trim().split(/\s+/);
  const nome = parts.shift() || '';
  return { nome, sobrenome: parts.join(' ') };
};

const buildPermissionsFromUser = (user?: UsuarioSistema | null) => {
  if (!user?.permissoes) {
    return {
      permissoes: ['inicio'] as string[],
      financeiroAbas: [],
      abasModulos: {},
    };
  }

  const permissions = normalizeGestorPermissions(user.permissoes, {
    fallbackFullAccess: false,
  });
  const scopedFinanceiroAbas = permissions.tabs?.financeiro || [];
  const financeiroAbas = scopedFinanceiroAbas.length > 0
    ? scopedFinanceiroAbas
    : permissions.financeiroTabs.length > 0
      ? permissions.financeiroTabs
      : permissions.modules.includes('financeiro')
        ? DEFAULT_FINANCEIRO_TABS
        : [];
  const abasModulos: Record<string, string[]> = permissions.tabs
    ? {
        ...permissions.tabs,
        secretaria: normalizeSecretariaAccessTabs(permissions.tabs.secretaria),
      }
    : {};
  if (
    permissions.modules.includes('gestao')
    && !Object.prototype.hasOwnProperty.call(abasModulos, 'gestao')
  ) {
    abasModulos.gestao = DEFAULT_GESTAO_TURMA_TABS;
  }
  return {
    permissoes: permissions.modules.length > 0 ? permissions.modules : ['inicio'],
    financeiroAbas,
    abasModulos,
  };
};

const UserFormAdd: React.FC<UserFormAddProps> = ({
  contextId,
  onSave,
  onCancel,
  initialUser,
}) => {
  const { data: companies = [] } = useUsuariosPolosQuery();
  const [perfis, setPerfis] = useState<PerfilAcesso[]>([]);
  
  const [formData, setFormData] = useState<NovoUsuarioFormData>({
    nome: '',
    sobrenome: '',
    cpf: '',
    dataNascimento: '',
    telefone: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    todosPolos: contextId === 'global',
    polosAcesso: contextId === 'global' ? [] : [contextId],
    permissoes: ['inicio'],
    financeiroAbas: [],
    abasModulos: {},
    perfil_acesso_id: null,
    personalizarPermissoes: false,
    personalizarHorario: true,
    horarioAtivo: false,
    diasHorario: [1, 2, 3, 4, 5, 6],
    horarioInicio: '08:00',
    horarioFim: '18:00',
    setorComunicacao: 'todos',
    poloComunicacaoId: contextId === 'global' ? null : contextId,
    podeVisualizarTodosSetores: false,
  });

  const [passwordStrength, setPasswordStrength] = useState(0);

  const isEditing = Boolean(initialUser?.id);

  const selectedPerfil = perfis.find(p => p.id === formData.perfil_acesso_id);

  useEffect(() => {
    if (contextId !== 'global') {
      setFormData(prev => ({
        ...prev,
        todosPolos: false,
        polosAcesso: prev.polosAcesso.includes(contextId)
          ? prev.polosAcesso
          : [contextId, ...prev.polosAcesso],
      }));
    }
  }, [contextId]);

  useEffect(() => {
    if (!initialUser) return;
    const { nome, sobrenome } = splitFullName(initialUser.nome || '');
    const permissions = buildPermissionsFromUser(initialUser);
    const isGlobal = contextId === 'global';
    const hasAllPolos = isGlobal ? Boolean(initialUser.permissoes?.allPolos) : false;

    setFormData(prev => ({
      ...prev,
      nome,
      sobrenome,
      cpf: initialUser.cpf || '',
      dataNascimento: '',
      telefone: initialUser.telefone || '',
      email: initialUser.email || '',
      senha: '',
      confirmarSenha: '',
      todosPolos: hasAllPolos,
      polosAcesso: initialUser.polo_ids && initialUser.polo_ids.length > 0
        ? initialUser.polo_ids
        : contextId === 'global'
          ? []
          : [contextId],
      permissoes: permissions.permissoes,
      financeiroAbas: permissions.financeiroAbas,
      abasModulos: permissions.abasModulos,
      perfil_acesso_id: initialUser.perfil_acesso_id || null,
      personalizarPermissoes: Boolean(initialUser.personalizar_permissoes),
      personalizarHorario: Boolean(initialUser.restricao_horario) || !initialUser.perfil_acesso_id,
      horarioAtivo: Boolean(initialUser.restricao_horario?.ativo),
      diasHorario: initialUser.restricao_horario?.dias || [1, 2, 3, 4, 5, 6],
      horarioInicio: initialUser.restricao_horario?.horario_inicio || '08:00',
      horarioFim: initialUser.restricao_horario?.horario_fim || '18:00',
      setorComunicacao: initialUser.setor_comunicacao || 'todos',
      poloComunicacaoId: initialUser.polo_comunicacao_id || (contextId === 'global' ? null : contextId),
      podeVisualizarTodosSetores: Boolean(initialUser.pode_visualizar_todos_setores),
    }));
  }, [contextId, initialUser]);

  useEffect(() => {
    const fetchPerfis = async () => {
      try {
        const data = await perfisAcessoService.getAll();
        setPerfis(data);
      } catch (err) {
        console.error('Erro ao buscar perfis de acesso:', err);
      }
    };
    fetchPerfis();
  }, []);

  // Formatadores
  const formatCPF = (value: string) => {
    return value ? formatCpf(value) : '';
  };

  const formatPhone = (value: string) => value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');

  const checkPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length > 6) score += 1;
    if (pass.length > 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    setPasswordStrength(score);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'cpf') {
      setFormData(prev => ({ ...prev, [name]: formatCPF(value) }));
    } else if (name === 'telefone') {
      setFormData(prev => ({ ...prev, [name]: formatPhone(value) }));
    } else if (name === 'email') {
      setFormData(prev => ({ ...prev, [name]: normalizeEmail(value) }));
    } else if (name === 'senha') {
      setFormData(prev => ({ ...prev, [name]: value }));
      checkPasswordStrength(value);
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const togglePolo = (id: string) => {
    if (formData.todosPolos) return;
    setFormData(prev => {
      const current = prev.polosAcesso;
      if (current.includes(id)) return { ...prev, polosAcesso: current.filter(p => p !== id) };
      return { ...prev, polosAcesso: [...current, id] };
    });
  };

  const togglePermission = (id: string) => {
    setFormData(prev => {
      const current = prev.permissoes;
      if (current.includes(id)) {
        const nextTabs = { ...prev.abasModulos };
        delete nextTabs[id];
        return {
          ...prev,
          permissoes: current.filter(p => p !== id),
          financeiroAbas: id === 'financeiro' ? [] : prev.financeiroAbas,
          abasModulos: nextTabs,
        };
      }

      const availableTabs = USER_FORM_MODULE_TABS[id] || [];
      return {
        ...prev,
        permissoes: [...current, id],
        financeiroAbas: id === 'financeiro' && prev.financeiroAbas.length === 0
          ? DEFAULT_FINANCEIRO_TABS
          : prev.financeiroAbas,
        abasModulos: availableTabs.length > 0
          ? { ...prev.abasModulos, [id]: availableTabs.map(tab => tab.id) }
          : prev.abasModulos,
      };
    });
  };

  const toggleTodosPolos = () => {
    if (contextId !== 'global') return;
    setFormData(prev => ({
      ...prev,
      todosPolos: !prev.todosPolos,
      polosAcesso: !prev.todosPolos ? [] : contextId === 'global' ? [] : [contextId],
    }));
  };

  const toggleFinanceiroTab = (id: string) => {
    setFormData(prev => {
      const current = prev.financeiroAbas;
      if (current.includes(id)) {
        return { ...prev, financeiroAbas: current.filter(tab => tab !== id) };
      }

      return { ...prev, financeiroAbas: [...current, id] };
    });
  };

  const toggleModuleTab = (moduleId: string, tabId: string) => {
    setFormData(prev => {
      const current = prev.abasModulos[moduleId] || [];
      return {
        ...prev,
        abasModulos: {
          ...prev.abasModulos,
          [moduleId]: current.includes(tabId)
            ? current.filter(id => id !== tabId)
            : [...current, tabId],
        },
      };
    });
  };

  const toggleScheduleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      diasHorario: prev.diasHorario.includes(day)
        ? prev.diasHorario.filter(current => current !== day)
        : [...prev.diasHorario, day].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidCpf(formData.cpf)) {
      alert('Informe um CPF válido para o usuário.');
      return;
    }
    if (!isEditing && !formData.dataNascimento) {
      alert('Informe a data de nascimento do usuário.');
      return;
    }
    if (formData.telefone.length < 14) {
      alert('Informe o telefone do usuário.');
      return;
    }
    if (!isValidEmail(formData.email)) {
      alert('Informe um e-mail válido. Ele será usado como login do gestor/usuário.');
      return;
    }
    if (formData.senha || formData.confirmarSenha) {
      if (!formData.senha || formData.senha.length < 6) {
        alert('A senha precisa ter ao menos 6 caracteres.');
        return;
      }
      if (formData.senha !== formData.confirmarSenha) {
        alert('As senhas não coincidem!');
        return;
      }
    }
    if (!isEditing && !formData.senha) {
      alert('Informe a senha inicial do usuário.');
      return;
    }
    if (!formData.todosPolos && formData.polosAcesso.length === 0) {
      alert('Selecione ao menos um polo para este usuário.');
      return;
    }
    if (!formData.perfil_acesso_id || formData.personalizarPermissoes) {
      if (formData.permissoes.length === 0 || !formData.permissoes.some(moduleId => GESTOR_MODULE_IDS.includes(moduleId as GestorModuleId))) {
        alert('Selecione ao menos um módulo para este usuário.');
        return;
      }
      if (formData.permissoes.includes('financeiro') && formData.financeiroAbas.length === 0) {
        alert('Selecione ao menos uma aba do módulo financeiro.');
        return;
      }
      for (const moduleId of ['gestao', 'cadastros', 'secretaria', 'comunicacao']) {
        if (formData.permissoes.includes(moduleId) && (formData.abasModulos[moduleId] || []).length === 0) {
          alert(`Selecione ao menos uma aba do módulo ${moduleId}.`);
          return;
        }
      }
    }
    if (formData.personalizarHorario && formData.horarioAtivo && formData.diasHorario.length === 0) {
      alert('Selecione ao menos um dia permitido para o horário individual.');
      return;
    }
    if (formData.personalizarHorario && formData.horarioAtivo && formData.horarioInicio === formData.horarioFim) {
      alert('O início e o fim do horário individual não podem ser iguais.');
      return;
    }
    const hasWhatsAppAccess = formData.permissoes.includes('comunicacao')
      && (formData.abasModulos.comunicacao || []).includes('comunicacao-whatsapp');
    if (hasWhatsAppAccess && !formData.podeVisualizarTodosSetores && !formData.poloComunicacaoId) {
      alert('Selecione o polo de atendimento do WhatsApp para este usuário.');
      return;
    }
    onSave({ ...formData, email: normalizeEmail(formData.email) });
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col h-full animate-fadeIn">
      
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">
            {isEditing ? 'Editar Usuário' : 'Novo Usuário'}
          </h3>
          <p className="text-slate-500 text-sm">
            {isEditing
              ? 'Ajuste os acessos e módulos para este usuário.'
              : 'Preencha as informações para conceder acesso ao sistema.'}
          </p>
        </div>
        <button onClick={onCancel} className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <UserIdentitySections
          formData={formData}
          isEditing={isEditing}
          contextId={contextId}
          companies={companies}
          passwordStrength={passwordStrength}
          onChange={handleChange}
          onToggleAllPolos={toggleTodosPolos}
          onTogglePolo={togglePolo}
        />
        <UserAccessSections
          contextId={contextId}
          formData={formData}
          perfis={perfis}
          selectedPerfil={selectedPerfil}
          companies={companies}
          setFormData={setFormData}
          onTogglePermission={togglePermission}
          onToggleFinanceiroTab={toggleFinanceiroTab}
          onToggleModuleTab={toggleModuleTab}
          onToggleScheduleDay={toggleScheduleDay}
        />
      </form>

      {/* Footer Actions */}
      <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-4">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-8 py-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button 
          onClick={handleSubmit}
          className="px-8 py-4 rounded-xl bg-[#001a33] text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-900 shadow-lg shadow-blue-900/20 flex items-center gap-2"
        >
          <Save size={18} />
          {isEditing ? 'Atualizar Usuário' : 'Salvar Usuário'}
        </button>
      </div>
    </div>
  );
};

export default UserFormAdd;
