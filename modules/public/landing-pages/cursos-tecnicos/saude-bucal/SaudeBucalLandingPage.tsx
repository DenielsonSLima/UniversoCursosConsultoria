import React from 'react';
import type { TechnicalCourseLandingPageProps } from '../technicalLanding.types';
import TechnicalLandingLayout from '../shared/TechnicalLandingLayout';
import SaudeBucalEnrollmentForm from './SaudeBucalEnrollmentForm';
import { saudeBucalLandingConfig } from './saudeBucal.config';

const SaudeBucalLandingPage: React.FC<TechnicalCourseLandingPageProps> = (props) => (
  <TechnicalLandingLayout
    {...props}
    config={saudeBucalLandingConfig}
    EnrollmentForm={SaudeBucalEnrollmentForm}
  />
);

export default SaudeBucalLandingPage;
