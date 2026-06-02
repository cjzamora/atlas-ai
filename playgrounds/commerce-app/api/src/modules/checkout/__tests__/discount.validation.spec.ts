import { validateDiscountCode } from "../discount.validation";

export function discountValidationSpec() {
  return validateDiscountCode("SAVE10", "US");
}
