import { calculateTally } from "../../src/services/metering.js";

export function meteringTestCase() {
  return calculateTally({ stale: false, ceiling: 10 }, 25);
}
