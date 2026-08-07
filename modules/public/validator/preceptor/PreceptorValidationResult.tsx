import React from 'react';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';
import type { CarteirinhaPreceptorValidationResult as PreceptorResult } from '../validator.types';

const PreceptorValidationResult: React.FC<{ result: PreceptorResult }> = ({ result }) => (
  <AcademicDocumentValidationCard
    result={result}
    accentClass="text-indigo-800"
    softClass="bg-indigo-50"
    identityLabel="Preceptor"
  />
);

export default PreceptorValidationResult;
