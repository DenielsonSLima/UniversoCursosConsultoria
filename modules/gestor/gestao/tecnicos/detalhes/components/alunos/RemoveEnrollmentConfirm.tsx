import React from 'react';
import ConfirmModal from '../../../../../components/ConfirmModal';
import { AcademicStudent } from '../../academic-lifecycle.service';

interface RemoveEnrollmentConfirmProps {
  student: AcademicStudent | null;
  pending: boolean;
  readOnly: boolean;
  onClose: () => void;
  onConfirm: (matriculaId: string) => void;
}

const RemoveEnrollmentConfirm: React.FC<RemoveEnrollmentConfirmProps> = ({
  student,
  pending,
  readOnly,
  onClose,
  onConfirm,
}) => (
  <ConfirmModal
    isOpen={!!student}
    onClose={onClose}
    onConfirm={() => {
      if (student && !readOnly) onConfirm(student.matricula_id);
    }}
    title="Remover aluno"
    message={`Remover ${student?.nome || 'este aluno'} apaga a matrícula desta turma e as cobranças vinculadas. Se houver diário, notas, frequência ou a turma já tiver começado, o banco bloqueará e você deve usar o cancelamento.`}
    confirmText={pending ? 'Removendo...' : 'Remover'}
    cancelText="Voltar"
    variant="danger"
  />
);

export default RemoveEnrollmentConfirm;
