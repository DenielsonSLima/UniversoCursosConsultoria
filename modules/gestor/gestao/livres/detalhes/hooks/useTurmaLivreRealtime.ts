import { useTurmaPresencialRealtime } from '../../../hooks/useTurmaPresencialRealtime';

export const useTurmaLivreRealtime = (turmaId: string) => {
  useTurmaPresencialRealtime({
    turmaId,
    modalidade: 'LIVRE',
    channelPrefix: 'turma-livre',
  });
};
