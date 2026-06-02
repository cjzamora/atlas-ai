export function validateDiscountCode(code: string, country: string) {
  if (!code.startsWith("SAVE")) {
    return false;
  }
  return ["US", "CA", "GB"].includes(country);
}

export function validateCartSubtotal(subtotalCents: number) {
  return subtotalCents > 0;
}
