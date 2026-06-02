import { AreaCalculator } from "../src/area-calculator";

export function areaCalculatorTestCase() {
  const result = new AreaCalculator().rectangleArea(2, 3);
  if (result !== 6) {
    throw new Error(`expected rectangleArea(2,3) to be 6, got ${result}`);
  }
}
