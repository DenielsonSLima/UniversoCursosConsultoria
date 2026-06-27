import { useCursosPresenciaisRealtime } from '../../hooks/useCursosPresenciaisRealtime';

export function useCursosEspecializacaoRealtime(onChange: () => void) {
  useCursosPresenciaisRealtime({
    channelName: 'cadastros_cursos_especializacao_realtime',
    modalidade: 'ESPECIALIZACAO',
    onChange,
  });
}
