import { renderCard, renderButton } from "./widget.js";

export function widgetTestCase() {
  const card = renderCard("Users", 42);
  if (card.value !== 42) {
    throw new Error("renderCard should preserve the value");
  }
  const button = renderButton("Go");
  if (button.kind !== "button") {
    throw new Error("renderButton should mark kind=button");
  }
}
