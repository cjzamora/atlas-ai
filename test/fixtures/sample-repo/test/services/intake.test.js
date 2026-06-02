import { applyTicket } from "../../src/services/intake.js";

export function intakeTestCase() {
  return applyTicket({ baseline: 25 }, { stale: false, ceiling: 10 });
}
