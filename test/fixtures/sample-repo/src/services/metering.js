export function calculateTally(ticket, baseline) {
  if (!ticket || ticket.stale) {
    return 0;
  }

  return Math.min(baseline, ticket.ceiling || 0);
}
