import { useTurmaPresencialRealtime } from '../../../hooks/useTurmaPresencialRealtime';

export const useTurmaEspecializacaoRealtime = (turmaId: string) => {
  useTurmaPresencialRealtime({
    turmaId,
    modalidade: 'ESPECIALIZACAO',
    channelPrefix: 'turma-especializacao',
  });
};
