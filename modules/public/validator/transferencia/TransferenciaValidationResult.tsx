import React from 'react';
import { AcademicDocumentValidationResult } from '../validator.types';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';

interface TransferenciaValidationResultProps {
  result: AcademicDocumentValidationResult;
}

const TransferenciaValidationResult: React.FC<TransferenciaValidationResultProps> = ({ result }) => (
  <AcademicDocumentValidationCard
    result={result}
    accentClass="text-orange-700"
    softClass="bg-orange-50"
  />
);

export default TransferenciaValidationResult;
