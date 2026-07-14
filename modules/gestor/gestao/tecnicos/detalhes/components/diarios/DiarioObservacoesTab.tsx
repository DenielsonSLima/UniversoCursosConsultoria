import React from 'react';

interface DiarioObservacoesTabProps {
  observacoes: string;
  isReadOnly: boolean;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
}

const DiarioObservacoesTab: React.FC<DiarioObservacoesTabProps> = ({
  observacoes,
  isReadOnly,
  onChange,
  onSave,
}) => (
  <div className="p-6">
    <div className="space-y-4 max-w-4xl">
      <div>
        <label className="text-xs font-bold tracking-wider uppercase text-slate-500 mb-2 block">Anotações do Docente:</label>
        <textarea
          className="w-full rounded-2xl border border-slate-200 p-5 text-sm font-medium text-slate-700 min-h-[300px] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-slate-50 focus:bg-white resize-none"
          value={observacoes}
          onChange={(event) => {
            if (!isReadOnly) onChange(event.target.value);
          }}
          onBlur={(event) => {
            if (!isReadOnly) onSave(event.target.value);
          }}
          readOnly={isReadOnly}
          placeholder="Digite aqui as observações gerais sobre a unidade educacional, ocorrências em sala, rendimento da turma, etc..."
        />
      </div>
    </div>
  </div>
);

export default DiarioObservacoesTab;
