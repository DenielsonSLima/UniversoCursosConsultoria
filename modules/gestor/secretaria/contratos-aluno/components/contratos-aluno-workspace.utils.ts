import { CreditCard, Search, Users } from 'lucide-react';
import { normalizeSecretariaSearch } from '../../secretaria-search';
import type { ContratoAlunoEmissionMode, ContratoAlunoTarget } from '../types/contratos-aluno.types';

export const modeOptions: Array<{
  id: ContratoAlunoEmissionMode;
  label: string;
  description: string;
  icon: typeof Search;
}> = [
  {
    id: 'INDIVIDUAL',
    label: 'Individual',
    description: 'Busque um aluno e visualize o contrato.',
    icon: Search,
  },
  {
    id: 'LOTE',
    label: 'Em lote',
    description: 'Gere para uma turma ou todos os alunos.',
    icon: Users,
  },
  {
    id: 'PERSONALIZADO',
    label: 'Personalizado',
    description: 'Monte uma lista mista de alunos.',
    icon: CreditCard,
  },
];

export const modalityLabel = (modalidade: string) => {
  if (modalidade === 'SUPERIOR') return 'Especialização';
  if (modalidade === 'LIVRE') return 'Livre';
  if (modalidade === 'TECNICO') return 'Técnico';
  return modalidade || 'Não informada';
};

export const matchesSearch = (target: ContratoAlunoTarget, normalizedSearch: string) => [
  target.alunoNome,
  target.cursoNome,
  target.turmaNome,
  target.turmaCodigo,
  target.modalidade,
].some((value) => normalizeSecretariaSearch(value).includes(normalizedSearch));

export const groupTargetsByStudent = (targets: ContratoAlunoTarget[]) => {
  const grouped = new Map<string, ContratoAlunoTarget[]>();
  targets.forEach((target) => {
    const key = target.alunoId || target.enrollmentId;
    grouped.set(key, [...(grouped.get(key) || []), target]);
  });
  return [...grouped.values()];
};

