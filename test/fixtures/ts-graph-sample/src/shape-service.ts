import { AreaCalculator } from "./area-calculator";
import { PerimeterCalculator } from "./perimeter-calculator";

export class ShapeService {
  constructor(
    private readonly areas: AreaCalculator,
    private readonly perimeters: PerimeterCalculator
  ) {}

  describeRectangle(width: number, height: number) {
    const area = this.areas.rectangleArea(width, height);
    const perimeter = this.perimeters.rectanglePerimeter(width, height);
    return { area, perimeter };
  }
}
