import React from 'react';
import PasswordRecoveryAppView from './password-recovery/PasswordRecoveryAppView';
import PasswordRecoveryWebView from './password-recovery/PasswordRecoveryWebView';
import type { PasswordRecoveryPageProps } from './password-recovery/password-recovery-auth';
import { usePasswordRecovery } from './password-recovery/usePasswordRecovery';

const PasswordRecoveryPage: React.FC<PasswordRecoveryPageProps> = ({ appFlow = false }) => {
  const model = usePasswordRecovery({ appFlow });
  return appFlow
    ? <PasswordRecoveryAppView model={model} />
    : <PasswordRecoveryWebView model={model} />;
};

export default PasswordRecoveryPage;
