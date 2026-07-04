import { supabase } from '../../../../../lib/supabase';
import {
  ActivityResponseDraft,
  AtividadeExtraClasse,
} from './alunoAtividadesExtra.types';
import {
  getAtividadeRespostaAtual,
  getPerguntaTexto,
} from './alunoAtividadesExtra.utils';

export const alunoAtividadesExtraService = {
  async getAtividades(turmaId: string) {
    const { data, error } = await supabase
      .from('atividades_extra_classe')
      .select(`
        id,
        titulo,
        tema,
        texto,
        video_url,
        perguntas,
        carga_horaria_compensacao,
        prazo_entrega,
        disciplina:disciplinas(id, nome),
        respostas:atividade_extra_classe_respostas(
          id,
          resposta_texto,
          respostas,
          anexo_url,
          status,
          nota,
          feedback
        )
      `)
      .eq('turma_id', turmaId)
      .eq('status', 'PUBLICADA')
      .order('prazo_entrega', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
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

    const perguntas = Array.isArray(input.atividade.perguntas) ? input.atividade.perguntas : [];
    const respostasAnteriores = Array.isArray(respostaAtual?.respostas) ? respostaAtual.respostas : [];
    const respostas = perguntas.map((pergunta, index) => ({
      pergunta: getPerguntaTexto(pergunta, index),
      resposta: input.draft?.respostas?.[index] ?? respostasAnteriores[index]?.resposta ?? '',
    }));
    const respostaTexto = input.draft?.texto ?? respostaAtual?.resposta_texto ?? '';
    const anexoUrl = input.draft?.anexoUrl ?? respostaAtual?.anexo_url ?? '';
    const hasAnswer = respostaTexto.trim() || anexoUrl.trim() || respostas.some((item) => item.resposta.trim());

    if (!hasAnswer) {
      throw new Error('Preencha a resposta antes de enviar.');
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
        .eq('id', respostaAtual.id);

      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('atividade_extra_classe_respostas')
      .insert({
        atividade_id: input.atividade.id,
        aluno_id: input.alunoId,
        ...payload,
      });

    if (error) throw error;
  },
};
