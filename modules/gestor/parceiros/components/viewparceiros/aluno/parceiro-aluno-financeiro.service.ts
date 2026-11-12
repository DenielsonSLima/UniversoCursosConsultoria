import { supabase } from '../../../../../../lib/supabase';

export interface StudentReceivable {
  id: string;
  matricula_id: string | null;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  tipo_lancamento: string | null;
  can_open_boleto: boolean;
  matriculas: { id: string; status: string; data_matricula: string } | null;
  turmas: { nome: string; codigo: string; cursos: { nome: string }; polos: { nome: string } } | null;
}
export interface StudentFinanceView {
  items: StudentReceivable[];
  summary: { paid: number; open: number; suspended: number };
}

export async function loadStudentFinanceView(alunoId: string): Promise<StudentFinanceView> {
  const { data, error } = await supabase.rpc('parceiro_aluno_financeiro_visualizacao', { p_aluno_id: alunoId });
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || !data.summary) throw new Error('Resposta financeira inválida.');
  return data;
}

export async function loadExistingBoletoPdf(receivableId: string, signal: AbortSignal): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke<Blob>('banese-boleto-document', {
    body: { receivableId }, signal,
  });
  if (error) throw new Error('Não foi possível abrir este boleto. Confira seu acesso e tente novamente.');
  if (!(data instanceof Blob) || !data.type.toLowerCase().includes('application/pdf')) {
    throw new Error('O servidor não retornou um boleto PDF válido.');
  }
  return data;
}
