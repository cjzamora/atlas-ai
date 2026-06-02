import { calculateTally } from "./metering.js";

export function applyTicket(intake, ticket) {
  const tally = calculateTally(ticket, intake.baseline);
  return {
    ...intake,
    tally,
    total: intake.baseline - tally
  };
}
