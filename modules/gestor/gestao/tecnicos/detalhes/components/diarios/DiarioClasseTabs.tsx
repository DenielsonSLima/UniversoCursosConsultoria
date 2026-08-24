import type { Dispatch, SetStateAction } from 'react';
import { Loader2 } from 'lucide-react';
import DiarioConteudoTab from './DiarioConteudoTab';
import DiarioFechamentoTab from './DiarioFechamentoTab';
import DiarioFrequenciaTab from './DiarioFrequenciaTab';
import DiarioObservacoesTab from './DiarioObservacoesTab';
import DiarioResultadoTab from './DiarioResultadoTab';
import TechnicalDataError from '../TechnicalDataError';
import type { DiarioAula, DiarioStudent } from './diario-classe.service';
import type {
  ActiveInstruments,
  AttendanceMap,
  DiarioActiveTab,
  DiarioClosureState,
  DiarioLockScope,
  GradesMap,
} from './diario-classe.types';
import { getStudentStats } from './diario-classe.utils';

export type EditableGradeField = 'p' | 'ti' | 'tg' | 's' | 'cq' | 'o' | 'rec';

interface DiarioClasseTabsProps {
  activeTab: DiarioActiveTab;
  students: DiarioStudent[];
  aulas: DiarioAula[];
  attendanceMap: AttendanceMap;
  gradesMap: GradesMap;
  localGrades: GradesMap;
  activeInstruments: ActiveInstruments;
  isReadOnly: boolean;
  onToggleAttendance: (studentId: string, classId: string) => void;
  onToggleInstrument: (field: keyof ActiveInstruments) => void;
  onGradeChange: (studentId: string, field: EditableGradeField, value: string) => void;
  onSaveGrade: (studentId: string, field: EditableGradeField) => void;
  localTitulos: Record<string, string>;
  setLocalTitulos: Dispatch<SetStateAction<Record<string, string>>>;
  localPraticas: Record<string, string>;
  setLocalPraticas: Dispatch<SetStateAction<Record<string, string>>>;
  savingAulaId?: string;
  onSaveAulaTitle: (aulaId: string, titulo: string) => void;
  onSavePratica: (aulaId: string, text: string) => void;
  observacoes: string;
  onChangeObservacoes: (value: string) => void;
  onSaveObservacoes: (value: string) => void;
  closureState?: DiarioClosureState;
  accessMode: 'GESTOR' | 'PROFESSOR';
  closureSaving: boolean;
  onClosureChange: (
    bloqueio: DiarioLockScope,
    motivo?: string,
    confirmarPendencias?: boolean,
  ) => void;
  closureError: boolean;
  closureRetrying: boolean;
  closurePending: boolean;
  onRetryClosure: () => void;
}

const DiarioClasseTabs = ({
  activeTab,
  students,
  aulas,
  attendanceMap,
  gradesMap,
  localGrades,
  activeInstruments,
  isReadOnly,
  onToggleAttendance,
  onToggleInstrument,
  onGradeChange,
  onSaveGrade,
  localTitulos,
  setLocalTitulos,
  localPraticas,
  setLocalPraticas,
  savingAulaId,
  onSaveAulaTitle,
  onSavePratica,
  observacoes,
  onChangeObservacoes,
  onSaveObservacoes,
  closureState,
  accessMode,
  closureSaving,
  onClosureChange,
  closureError,
  closureRetrying,
  closurePending,
  onRetryClosure,
}: DiarioClasseTabsProps) => (
  <div className="mb-8 flex min-h-[500px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex-1">
      {activeTab === 'frequencia' && (
        <DiarioFrequenciaTab
          students={students}
          aulas={aulas}
          attendanceMap={attendanceMap}
          isReadOnly={isReadOnly}
          onToggleAttendance={onToggleAttendance}
          getStats={(studentId) => getStudentStats(gradesMap, studentId)}
        />
      )}
      {activeTab === 'resultado' && (
        <DiarioResultadoTab
          students={students}
          localGrades={localGrades}
          isReadOnly={isReadOnly}
          activeInstruments={activeInstruments}
          onToggleInstrument={onToggleInstrument}
          getStats={(studentId) => getStudentStats(gradesMap, studentId)}
          onGradeChange={onGradeChange}
          onSaveGrade={onSaveGrade}
        />
      )}
      {activeTab === 'conteudo' && (
        <DiarioConteudoTab
          aulas={aulas}
          localTitulos={localTitulos}
          setLocalTitulos={setLocalTitulos}
          localPraticas={localPraticas}
          setLocalPraticas={setLocalPraticas}
          canEditAulaTitle={!isReadOnly}
          canEditPratica={!isReadOnly}
          savingAulaId={savingAulaId}
          onSaveAulaTitle={onSaveAulaTitle}
          onSavePratica={onSavePratica}
        />
      )}
      {activeTab === 'observacoes' && (
        <DiarioObservacoesTab
          observacoes={observacoes}
          isReadOnly={isReadOnly}
          onChange={onChangeObservacoes}
          onSave={onSaveObservacoes}
        />
      )}
      {activeTab === 'fechamento' && closureState && (
        <DiarioFechamentoTab
          state={closureState}
          accessMode={accessMode}
          saving={closureSaving}
          onChange={onClosureChange}
        />
      )}
      {activeTab === 'fechamento' && closureError && (
        <div className="p-6">
          <TechnicalDataError
            title="Fechamento não carregado"
            message="Os demais dados do diário continuam disponíveis em modo seguro. Tente carregar novamente o estado de fechamento."
            retrying={closureRetrying}
            onRetry={onRetryClosure}
          />
        </div>
      )}
      {activeTab === 'fechamento' && closurePending && (
        <div className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-500">
          <Loader2 className="animate-spin text-blue-600" size={22} />
          Verificando o fechamento do diário...
        </div>
      )}
    </div>
  </div>
);

export default DiarioClasseTabs;
