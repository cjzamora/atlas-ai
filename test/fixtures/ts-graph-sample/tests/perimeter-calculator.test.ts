import { PerimeterCalculator } from "../src/perimeter-calculator";

export function perimeterCalculatorTestCase() {
  const result = new PerimeterCalculator().rectanglePerimeter(2, 3);
  if (result !== 10) {
    throw new Error(`expected rectanglePerimeter(2,3) to be 10, got ${result}`);
  }
}
