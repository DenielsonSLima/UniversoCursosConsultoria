import type {
  PatrimonioActionAvailability,
  PatrimonioItem,
} from './patrimonio.types';

export type PatrimonioDisplayStatus = 'ativo' | 'parcial' | 'baixado' | 'excluido';

export const getPatrimonioDisplayStatus = (item: PatrimonioItem): PatrimonioDisplayStatus => {
  if (item.status === 'excluido') return 'excluido';
  if (item.status === 'baixado' || item.quantidadeDisponivel <= 0) return 'baixado';
  if (item.quantidadeBaixada > 0) return 'parcial';
  return 'ativo';
};

export const getPatrimonioActionAvailability = (
  item: PatrimonioItem,
  isGlobal: boolean,
): PatrimonioActionAvailability => {
  const isExcluded = item.status === 'excluido';
  const hasAvailableQuantity = item.status === 'ativo' && item.quantidadeDisponivel > 0;
  const hasWriteOff = item.quantidadeBaixada > 0;

  const edit = item.canEdit && !isExcluded
    ? { enabled: true }
    : {
        enabled: false,
        reason: isExcluded
          ? 'Patrimônios excluídos ficam disponíveis somente para consulta.'
          : 'Você não possui permissão para editar este patrimônio.',
      };

  const writeOff = item.canWriteOff && hasAvailableQuantity
    ? { enabled: true }
    : {
        enabled: false,
        reason: isExcluded
          ? 'Patrimônios excluídos não podem receber baixa.'
          : item.status === 'baixado' || item.quantidadeDisponivel <= 0
            ? 'Este patrimônio já foi baixado integralmente.'
            : 'Você não possui permissão para registrar a perda deste patrimônio.',
      };

  const remove = isGlobal && item.canDelete && !isExcluded && !hasWriteOff
    ? { enabled: true }
    : {
        enabled: false,
        reason: !isGlobal
          ? 'Somente o gestor global pode excluir patrimônios.'
          : isExcluded
            ? 'Este patrimônio já está excluído.'
            : hasWriteOff
              ? 'Patrimônios com baixa registrada não podem ser excluídos.'
              : 'Este patrimônio não pode ser excluído.',
      };

  return { edit, writeOff, remove };
};
