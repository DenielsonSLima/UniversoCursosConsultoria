import { useCursosPresenciaisRealtime } from '../../hooks/useCursosPresenciaisRealtime';

export function useCursosLivresRealtime(onChange: () => void) {
  useCursosPresenciaisRealtime({
    channelName: 'cadastros_cursos_livres_realtime',
    modalidade: 'LIVRE',
    onChange,
  });
}
