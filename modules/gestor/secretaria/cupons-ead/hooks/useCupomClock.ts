import { useEffect, useState } from 'react';
import type { EadCoupon } from '../../../../ead/cupons/coupons-management.types';

// Updates the presentation at validity boundaries without changing the saved active flag.
export function useCupomClock(items: EadCoupon[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: number;
    const update = () => {
      window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const next = items.flatMap(item => [Date.parse(item.startsAt), Date.parse(item.endsAt)])
        .filter(time => Number.isFinite(time) && time > current);
      timer = window.setTimeout(update, Math.max(1, Math.min(60_000, ...next.map(time => time - current))));
    };
    update();
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [items]);
  return now;
}
