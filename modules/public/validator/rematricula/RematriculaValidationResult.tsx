import React from 'react';
import AcademicDocumentValidationCard from '../shared/AcademicDocumentValidationCard';
import { AcademicDocumentValidationResult } from '../validator.types';

const RematriculaValidationResult: React.FC<{ result: AcademicDocumentValidationResult }> = ({ result }) => (
  <AcademicDocumentValidationCard result={result} accentClass="text-violet-700" softClass="bg-violet-50" />
);

export default RematriculaValidationResult;
