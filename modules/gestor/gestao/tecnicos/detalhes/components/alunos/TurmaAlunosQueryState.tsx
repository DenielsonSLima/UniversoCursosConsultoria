import React from 'react';
import { Loader2 } from 'lucide-react';
import TechnicalDataError from '../TechnicalDataError';

interface TurmaAlunosQueryStateProps {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

const TurmaAlunosQueryState: React.FC<TurmaAlunosQueryStateProps> = ({
  isLoading,
  isError,
  isFetching,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
        <span className="ml-3 font-bold text-slate-500">Carregando matrículas...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <TechnicalDataError
        title="Matrículas não carregadas"
        message="As ações foram bloqueadas para evitar alterações com uma lista incompleta de alunos."
        retrying={isFetching}
        onRetry={onRetry}
      />
    );
  }

  return null;
};

export default TurmaAlunosQueryState;
