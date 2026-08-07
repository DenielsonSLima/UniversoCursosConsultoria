import { supabase } from '../../../../../lib/supabase';
import {
  ActivityResponseDraft,
  AtividadeExtraClasse,
} from './alunoAtividadesExtra.types';
import {
  getAtividadeRespostaAtual,
  getPerguntaTexto,
  isAlunoAtividadePrazoEncerrado,
  normalizeAlunoAtividadeHttpUrl,
} from './alunoAtividadesExtra.utils';

type SupabaseAtividadeRow = Omit<AtividadeExtraClasse, 'disciplina'> & {
  disciplina?: AtividadeExtraClasse['disciplina'] | AtividadeExtraClasse['disciplina'][];
};

const normalizeAtividadeRow = (row: SupabaseAtividadeRow): AtividadeExtraClasse => ({
  ...row,
  tipo_resposta: row.tipo_resposta || 'TEXTO',
  disciplina: Array.isArray(row.disciplina) ? row.disciplina[0] || null : row.disciplina || null,
  respostas: Array.isArray(row.respostas) ? row.respostas : [],
  perguntas: Array.isArray(row.perguntas) ? row.perguntas : [],
});

export const alunoAtividadesExtraService = {
  async getAtividades(turmaId: string): Promise<AtividadeExtraClasse[]> {
    const { data, error } = await supabase
      .from('atividades_extra_classe')
      .select(`
        id,
        titulo,
        tema,
        texto,
        video_url,
        tipo_resposta,
        perguntas,
        carga_horaria_compensacao,
        prazo_entrega,
        disciplina:disciplinas(id, nome, ordem, modulo:modulos(id, nome, ordem)),
        respostas:atividade_extra_classe_respostas(
          id,
          resposta_texto,
          respostas,
          anexo_url,
          status,
          nota,
          feedback,
          created_at,
          updated_at,
          entregue_em,
          corrigido_em
        )
      `)
      .eq('turma_id', turmaId)
      .eq('status', 'PUBLICADA')
      .order('prazo_entrega', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return ((data || []) as unknown as SupabaseAtividadeRow[]).map(normalizeAtividadeRow);
  },

  async submitResposta(input: {
    alunoId: string;
    atividade: AtividadeExtraClasse;
    draft?: ActivityResponseDraft;
  }) {
    const respostaAtual = getAtividadeRespostaAtual(input.atividade);

    if (respostaAtual?.status === 'CORRIGIDA') {
      throw new Error('Esta atividade já foi corrigida e não pode mais ser editada.');
    }

    if (isAlunoAtividadePrazoEncerrado(input.atividade.prazo_entrega)) {
      throw new Error('O prazo desta atividade foi encerrado e o envio não pode mais ser alterado.');
    }

    const perguntas = Array.isArray(input.atividade.perguntas) ? input.atividade.perguntas : [];
    const respostasAnteriores = Array.isArray(respostaAtual?.respostas) ? respostaAtual.respostas : [];
    const respostas = perguntas.map((pergunta, index) => ({
      pergunta: getPerguntaTexto(pergunta, index),
      resposta: input.draft?.respostas?.[index] ?? respostasAnteriores[index]?.resposta ?? '',
    }));
    const tipoResposta = input.atividade.tipo_resposta || 'TEXTO';
    const respostaTexto = ['TEXTO', 'MISTO'].includes(tipoResposta)
      ? input.draft?.texto ?? respostaAtual?.resposta_texto ?? ''
      : '';
    const anexoUrlInput = input.draft?.anexoUrl ?? respostaAtual?.anexo_url ?? '';
    const anexoUrl = ['ENVIO', 'MISTO'].includes(tipoResposta)
      ? normalizeAlunoAtividadeHttpUrl(anexoUrlInput, 'O link do trabalho', true) || ''
      : '';
    const respostasObrigatorias = ['PERGUNTAS', 'MISTO'].includes(tipoResposta);
    if (respostasObrigatorias && (perguntas.length === 0 || respostas.some((item) => !item.resposta.trim()))) {
      throw new Error('Responda todas as perguntas obrigatórias antes de enviar.');
    }
    if (tipoResposta === 'TEXTO' && !respostaTexto.trim()) {
      throw new Error('Preencha a resposta em texto antes de enviar.');
    }
    if (tipoResposta === 'ENVIO' && !anexoUrl) {
      throw new Error('Informe o link HTTPS do trabalho antes de enviar.');
    }
    if (tipoResposta === 'MISTO' && !respostaTexto.trim() && !anexoUrl) {
      throw new Error('Preencha o texto ou informe o link HTTPS do trabalho.');
    }

    const payload = {
      resposta_texto: respostaTexto.trim() || null,
      respostas,
      anexo_url: anexoUrl.trim() || null,
      status: 'ENTREGUE',
      nota: null,
      feedback: null,
    };

    if (respostaAtual?.id) {
      const { error } = await supabase
        .from('atividade_extra_classe_respostas')
        .update(payload)
        .eq('id', respostaAtual.id)
        .eq('aluno_id', input.alunoId)
        .select('id')
        .single();

      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('atividade_extra_classe_respostas')
      .insert({
        atividade_id: input.atividade.id,
        aluno_id: input.alunoId,
        ...payload,
      })
      .select('id')
      .single();

    if (error) throw error;
  },
};
