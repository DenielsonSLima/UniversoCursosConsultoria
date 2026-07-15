import React from 'react';
import type { TechnicalCourseLandingPageProps } from '../technicalLanding.types';
import TechnicalLandingLayout from '../shared/TechnicalLandingLayout';
import AnalisesClinicasEnrollmentForm from './AnalisesClinicasEnrollmentForm';
import { analisesClinicasLandingConfig } from './analisesClinicas.config';

const AnalisesClinicasLandingPage: React.FC<TechnicalCourseLandingPageProps> = (props) => (
  <TechnicalLandingLayout
    {...props}
    config={analisesClinicasLandingConfig}
    EnrollmentForm={AnalisesClinicasEnrollmentForm}
  />
);

export default AnalisesClinicasLandingPage;
