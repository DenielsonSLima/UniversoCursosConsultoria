import React from 'react';
import { Lock, Layers, Globe, Users, UserRound, GraduationCap } from 'lucide-react';
import type { AccessMode } from './uploadWizard.types';

export function getUploadAccessOptions(isProfessorUpload: boolean) {
  const accessOptions: Array<{
    mode: AccessMode;
    title: string;
    description: string;
    icon: React.ElementType;
  }> = isProfessorUpload ? [
    {
      mode: 'PRIVADO',
      title: 'Somente para mim',
      description: 'Arquivo privado no seu repositório docente.',
      icon: Lock
    },
    {
      mode: 'TURMAS',
      title: 'Turmas vinculadas',
      description: 'Libere para alunos das turmas ativas em que você leciona.',
      icon: Layers
    }
  ] : [
    {
      mode: 'PUBLICO',
      title: 'Publico para todos',
      description: 'Disponivel para qualquer perfil permitido no portal.',
      icon: Globe
    },
    {
      mode: 'ALUNOS',
      title: 'Somente alunos',
      description: 'Todos os alunos ativos podem acessar.',
      icon: Users
    },
    {
      mode: 'PROFESSORES',
      title: 'Somente professores',
      description: 'Material restrito ao corpo docente.',
      icon: UserRound
    },
    {
      mode: 'CURSOS',
      title: 'Cursos especificos',
      description: 'Selecione um ou mais cursos.',
      icon: GraduationCap
    },
    {
      mode: 'TURMAS',
      title: 'Turmas especificas',
      description: 'Selecione uma ou mais turmas.',
      icon: Layers
    },
    {
      mode: 'INTERNO',
      title: 'Equipe interna',
      description: 'Somente gestao e usuarios internos.',
      icon: Lock
    }
  ];

  return accessOptions;
}
