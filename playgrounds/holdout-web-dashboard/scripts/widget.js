export function renderCard(title, value) {
  return { title, value };
}

export function renderButton(label) {
  return { label, kind: "button" };
}
