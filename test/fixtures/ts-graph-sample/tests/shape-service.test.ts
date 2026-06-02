import { ShapeService } from "../src/shape-service";
import { AreaCalculator } from "../src/area-calculator";
import { PerimeterCalculator } from "../src/perimeter-calculator";

export function shapeServiceTestCase() {
  const service = new ShapeService(new AreaCalculator(), new PerimeterCalculator());
  const result = service.describeRectangle(2, 3);
  if (result.area !== 6 || result.perimeter !== 10) {
    throw new Error(`unexpected describeRectangle result: ${JSON.stringify(result)}`);
  }
}
