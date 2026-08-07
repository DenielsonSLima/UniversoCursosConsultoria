import React from 'react';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';
import type { AcademicDocumentValidationResult } from '../validator.types';

const FichaCadastralValidationResult: React.FC<{
  result: AcademicDocumentValidationResult;
}> = ({ result }) => (
  <AcademicDocumentValidationCard
    result={result}
    accentClass="text-blue-700"
    softClass="bg-blue-50"
  />
);

export default FichaCadastralValidationResult;
