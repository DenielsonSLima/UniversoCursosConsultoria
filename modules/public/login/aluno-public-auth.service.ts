import { getFriendlyAuthRedirectError } from './aluno-public-auth.helpers';
import {
  finalizePublicAlunoFirstAccess,
  needsPublicAlunoInitialAccess,
} from './aluno-public-first-access.service';
import {
  finishPublicAlunoExternalLogin,
  finishPublicAlunoExternalLoginAndListProfiles,
  loginPublicAluno,
  loginPublicAlunoAndListProfiles,
  loginPublicAlunoWithGoogle,
} from './aluno-public-session.service';
import { signupPublicAluno } from './aluno-public-signup.service';

export {
  PUBLIC_ALUNO_ALREADY_REGISTERED_CODE,
  PUBLIC_ALUNO_ALREADY_REGISTERED_MESSAGE,
  PUBLIC_ALUNO_CONFIRMATION_RESENT_MESSAGE,
  PUBLIC_ALUNO_RACA_COR_OPTIONS,
  PUBLIC_ALUNO_SEXO_OPTIONS,
  PublicAlunoAlreadyRegisteredError,
  isPublicAlunoAlreadyRegisteredError,
  type PublicAlunoSignupData,
} from './aluno-public-auth.contract';
export { getSafePublicAlunoRedirectPath } from './aluno-public-auth.helpers';

/**
 * Fachada estável do acesso público do aluno. As responsabilidades internas
 * ficam separadas por cadastro, sessão/OAuth e primeiro acesso.
 */
export const alunoPublicAuthService = {
  login: loginPublicAluno,
  loginAndListProfiles: loginPublicAlunoAndListProfiles,
  loginWithGoogle: loginPublicAlunoWithGoogle,
  finishExternalLogin: finishPublicAlunoExternalLogin,
  finishExternalLoginAndListProfiles: finishPublicAlunoExternalLoginAndListProfiles,
  getFriendlyAuthRedirectError,
  signup: signupPublicAluno,
  finalizeFirstAccess: finalizePublicAlunoFirstAccess,
  needsInitialAccess: needsPublicAlunoInitialAccess,
};
