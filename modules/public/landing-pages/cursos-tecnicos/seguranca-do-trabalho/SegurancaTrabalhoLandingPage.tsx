import React from 'react';
import type { TechnicalCourseLandingPageProps } from '../technicalLanding.types';
import TechnicalLandingLayout from '../shared/TechnicalLandingLayout';
import SegurancaTrabalhoEnrollmentForm from './SegurancaTrabalhoEnrollmentForm';
import { segurancaTrabalhoLandingConfig } from './segurancaTrabalho.config';

const SegurancaTrabalhoLandingPage: React.FC<TechnicalCourseLandingPageProps> = (props) => (
  <TechnicalLandingLayout
    {...props}
    config={segurancaTrabalhoLandingConfig}
    EnrollmentForm={SegurancaTrabalhoEnrollmentForm}
  />
);

export default SegurancaTrabalhoLandingPage;
