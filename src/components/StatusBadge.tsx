export function StatusBadge({ status }: { status: string }) {
  // Normalize (handles "Open", "OPEN", "Past_Due", etc.)
  const s = (status || '').toString().trim().toLowerCase().replace(/\s+/g, '_');

  // Map synonyms -> canonical
  const canonical =
    s === 'past_due' || s === 'over_due' ? 'overdue' :
    s === 'unpaid' ? 'open' :
    s;

  const cls: Record<string, string> = {
    overdue:  'bg-rose-100 text-rose-800',
    open:     'bg-amber-100 text-amber-800',
    paid:     'bg-emerald-100 text-emerald-800',
    partial:  'bg-sky-100 text-sky-800',
    draft:    'bg-neutral-100 text-neutral-700',
    void:     'bg-zinc-200 text-zinc-700',
  };

  const color = cls[canonical] ?? 'bg-neutral-100 text-neutral-700';

  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded ${color}`}>
      {status}
    </span>
  );
}
