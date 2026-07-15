import React from 'react';
import type { TechnicalCourseLandingPageProps } from '../technicalLanding.types';
import TechnicalLandingLayout from '../shared/TechnicalLandingLayout';
import EnfermagemEnrollmentForm from './EnfermagemEnrollmentForm';
import { enfermagemLandingConfig } from './enfermagem.config';

const EnfermagemLandingPage: React.FC<TechnicalCourseLandingPageProps> = (props) => (
  <TechnicalLandingLayout
    {...props}
    config={enfermagemLandingConfig}
    EnrollmentForm={EnfermagemEnrollmentForm}
  />
);

export default EnfermagemLandingPage;
