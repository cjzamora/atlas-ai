import { renderCard, renderButton } from "./widget.js";

export function mountDashboard(metrics) {
  const cards = metrics.map((metric) => renderCard(metric.name, metric.value));
  const refresh = renderButton("Refresh");
  return { cards, refresh };
}
