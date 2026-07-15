import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { paymentCheckoutService } from '../../../asaas/asaas.service';
import { getPortalProfile, savePortalSession, type PortalAuthProfile } from '../../../login/portal-session';
import type { TechnicalEnrollmentPayload } from './technicalLanding.types';

const profilePatchFor = (payload: TechnicalEnrollmentPayload) => {
  const studying = payload.highSchoolSituation !== 'CONCLUIDO';
  const grade = payload.highSchoolSituation === 'CURSANDO_2_ANO' ? 2
    : payload.highSchoolSituation === 'CURSANDO_3_ANO' ? 3
      : null;

  return {
    situacao_ensino_medio: studying ? 'CURSANDO' : 'CONCLUIDO',
    serie_ensino_medio_atual: grade,
    escola_ensino_medio: payload.schoolName,
    ano_previsto_conclusao_ensino_medio: payload.expectedCompletionYear
      ? Number(payload.expectedCompletionYear)
      : null,
    escolaridade_anterior: studying ? 'CURSANDO ENSINO MÉDIO' : 'ENSINO MÉDIO COMPLETO',
    instituicao_origem: payload.schoolName,
    ano_conclusao_ensino_medio: payload.completionYear,
  };
};

const getAlunoProfile = () => getPortalProfile({
  preferredRole: 'Aluno',
  allowedRoles: ['Aluno'],
});

export const useTechnicalEnrollmentController = () => {
  const [profile, setProfile] = useState<PortalAuthProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void getAlunoProfile()
      .then((value) => {
        if (!active) return;
        setProfile(value);
        if (value) savePortalSession(value);
      })
      .finally(() => {
        if (active) setIsCheckingAuth(false);
      });
    return () => { active = false; };
  }, []);

  const submit = useCallback(async (payload: TechnicalEnrollmentPayload) => {
    setIsSubmitting(true);
    try {
      const currentProfile = profile || await getAlunoProfile();
      if (!currentProfile || currentProfile.tipo !== 'Aluno') {
        throw new Error('Entre com seu cadastro de aluno para continuar a matrícula.');
      }

      const { error } = await supabase
        .from('parceiros')
        .update(profilePatchFor(payload))
        .eq('id', currentProfile.id)
        .eq('tipo', 'Aluno');
      if (error) throw new Error(`Não foi possível salvar os dados escolares: ${error.message}`);

      savePortalSession(currentProfile);
      const checkout = await paymentCheckoutService.getPublicCheckout(
        payload.courseId,
        currentProfile.id,
        payload.turmaId,
        { method: payload.paymentMethod },
      );
      window.location.assign(checkout.url);
    } finally {
      setIsSubmitting(false);
    }
  }, [profile]);

  return {
    isAuthenticated: Boolean(profile),
    isCheckingAuth,
    isSubmitting,
    submit,
  };
};
