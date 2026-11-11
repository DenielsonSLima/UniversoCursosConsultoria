import { useEffect, useState } from 'react';
import type { IndividualCancelResult } from '../individual/nfse-individual.types';
export default function NfseCancellationRetry({ result, busy, onRetry }: { result: IndividualCancelResult; busy: boolean; onRetry: () => void }) {
  const [clock, setClock] = useState(Date.now);
  const availableAt = result.retry?.availableAt ? Date.parse(result.retry.availableAt) : null;
  const remaining = availableAt === null ? null : Math.max(0, Math.ceil((availableAt - clock) / 1000));
  useEffect(() => {
    if (remaining === null || remaining <= 0 || result.retry?.used) return;
    const timer = setTimeout(() => setClock(Date.now()), 1000); return () => clearTimeout(timer);
  }, [remaining, result.retry?.used]);
  if (result.state !== 'CANCELLATION_PENDING' || !result.retry) return null;
  return <section className="nfse-individual-review" aria-label="Retomada manual do cancelamento"><h3>Retomar o mesmo pedido</h3>
    <p>A retomada mantém o mesmo evento e seus dados. O serviço consulta o resultado antes de decidir se poderá fazer um novo envio.</p>
    {result.retry.used ? <p role="status">A retomada já foi solicitada. Consulte o resultado desta operação.</p> : <>
      {remaining === null ? <p role="status">Retomada indisponível neste retorno. Consulte novamente a operação.</p>
        : remaining > 0 && <p role="status">Retomada disponível em {remaining} segundo(s).</p>}
      <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || remaining === null || remaining > 0} onClick={onRetry}>Retomar pedido</button>
    </>}
  </section>;
}
