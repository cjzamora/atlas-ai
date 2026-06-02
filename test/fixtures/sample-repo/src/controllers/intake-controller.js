import { applyTicket } from "../services/intake.js";

export function submitIntake(intake, ticket) {
  return applyTicket(intake, ticket);
}
