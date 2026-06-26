import { useEffect } from 'react';
import {
  CursoCadastroModalidade,
  cursoModalidadeService
} from '../curso-modalidade.service';

export function useCursoModalidadeRealtime(
  modalidade: CursoCadastroModalidade,
  onChange: () => void
) {
  useEffect(() => {
    return cursoModalidadeService.subscribeToModalidadeChanges(modalidade, onChange);
  }, [modalidade, onChange]);
}
