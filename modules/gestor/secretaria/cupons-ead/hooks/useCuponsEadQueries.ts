import { useQuery } from '@tanstack/react-query';
import { isEadCouponsEnvironmentAllowed } from '../../../../ead/cupons/coupons-environment';
import { eadCouponsManagementService } from '../../../../ead/cupons/coupons-management.service';
import { cuponsEadKeys } from '../cupons-ead.keys';

export function useCuponsEadList(poloId: string, contextId: string, search: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: cuponsEadKeys.list(poloId, contextId, search, page),
    queryFn: ({ signal }) => eadCouponsManagementService.list(poloId, search, page, signal),
    enabled: enabled && Boolean(poloId) && isEadCouponsEnvironmentAllowed(),
    staleTime: 15_000,
    retry: 1,
  });
}

export function useCuponsEadHistory(poloId: string, contextId: string, couponId: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: cuponsEadKeys.history(poloId, contextId, couponId, page),
    queryFn: ({ signal }) => eadCouponsManagementService.history(poloId, couponId, page, signal),
    enabled: enabled && Boolean(poloId && couponId) && isEadCouponsEnvironmentAllowed(),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useCuponsEadCourses(poloId: string, contextId: string, search: string, enabled: boolean) {
  return useQuery({
    queryKey: cuponsEadKeys.courses(poloId, contextId, search),
    queryFn: ({ signal }) => eadCouponsManagementService.courses(poloId, search, signal),
    enabled: enabled && Boolean(poloId) && isEadCouponsEnvironmentAllowed(),
    staleTime: 30_000,
    retry: 1,
  });
}
