import React from 'react';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';
import type { AcademicDocumentValidationResult } from '../validator.types';

const DiarioValidationResult: React.FC<{
  result: AcademicDocumentValidationResult;
}> = ({ result }) => (
  <AcademicDocumentValidationCard
    result={result}
    accentClass="text-cyan-800"
    softClass="bg-cyan-50"
  />
);

export default DiarioValidationResult;
