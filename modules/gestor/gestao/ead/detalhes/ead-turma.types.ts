export interface EadTurmaResumo {
  cursoId: string;
  cursoNome: string;
  area: string;
  valor: number;
  asaasUrl?: string | null;
  alunosTotal: number;
  alunosPendentes: number;
  alunosLiberados: number;
  alunosConcluidos: number;
  certificadosPendentes: number;
  certificadosEmitidos: number;
  receitaPrevista: number;
  receitaConfirmada: number;
  vagasTotais: number;
  configuracao?: {
    conteudos?: unknown[];
    atividades?: unknown[];
    regras?: {
      tempoMinimoMinutos?: number;
    };
  };
}

export interface EadAlunoTurma {
  matriculaId: string;
  alunoId: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  cpfCnpj?: string | null;
  status: string;
  inscricaoStatus?: string | null;
  dataMatricula?: string | null;
  aulasConcluidas: number;
  totalAulas: number;
  atividadesConcluidas: number;
  totalAtividades: number;
  progressoPercentual: number;
  notaProva?: number | null;
  certificadoStatus?: string | null;
  certificadoNumero?: string | null;
  valorPago?: number;
}

export interface AlunoDisponivel {
  id: string;
  nome: string;
  email?: string | null;
  cpfCnpj?: string | null;
  telefone?: string | null;
}

export interface EadPagamentoTurma {
  id: string;
  matricula_id?: string | null;
  nome?: string | null;
  email?: string | null;
  valor?: number | null;
  status: string;
  pago_em?: string | null;
  confirmado_em?: string | null;
  forma_pagamento?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  asaas_payment_id?: string | null;
}
