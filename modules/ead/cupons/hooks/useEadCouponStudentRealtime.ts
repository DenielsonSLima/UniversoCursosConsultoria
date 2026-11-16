import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { isEadCouponsEnvironmentAllowed } from '../coupons-environment';
import { eadCouponStudentKeys } from '../coupons-student.keys';

export const useEadCouponStudentRealtime = (alunoId?: string, couponId?: string) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isEadCouponsEnvironmentAllowed() || !alunoId || !couponId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let connected = false;
    const refresh = () => {
      if (disposed) return;
      void queryClient.invalidateQueries({ queryKey: eadCouponStudentKeys.student(alunoId), refetchType: 'none' });
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed) void queryClient.refetchQueries({ queryKey: eadCouponStudentKeys.student(alunoId), type: 'active', stale: true });
      }, 200);
    };
    const channel = supabase.channel(`ead-coupon-student-${alunoId}-${couponId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ead_coupon_events', filter: `coupon_id=eq.${couponId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ead_coupon_redemptions', filter: `aluno_id=eq.${alunoId}` }, refresh)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { if (connected) refresh(); connected = true; }
      });
    const whenVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', whenVisible);
      void supabase.removeChannel(channel);
    };
  }, [alunoId, couponId, queryClient]);
};
