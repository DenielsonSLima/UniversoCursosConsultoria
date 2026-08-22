import React from 'react';
import InstitutionalPasswordSetupWebView from './password-recovery/InstitutionalPasswordSetupWebView';
import PasswordRecoveryAppView from './password-recovery/PasswordRecoveryAppView';
import PasswordRecoveryWebView from './password-recovery/PasswordRecoveryWebView';
import type { PasswordRecoveryPageProps } from './password-recovery/password-recovery-auth';
import { usePasswordRecovery } from './password-recovery/usePasswordRecovery';

const PasswordRecoveryPage: React.FC<PasswordRecoveryPageProps> = (props) => {
  const model = usePasswordRecovery(props);
  if (props.appFlow) return <PasswordRecoveryAppView model={model} />;
  return model.isInstitutional
    ? <InstitutionalPasswordSetupWebView model={model} />
    : <PasswordRecoveryWebView model={model} />;
};

export default PasswordRecoveryPage;
