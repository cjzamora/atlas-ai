import type { WebhookDelivery, WebhookEvent } from "./webhook.model";

export class WebhooksService {
  recordInboundProviderEvent(event: WebhookEvent) {
    return {
      record: event,
      shouldProcess: true
    };
  }

  scheduleDeliveries(event: WebhookEvent, deliveries: WebhookDelivery[]) {
    return deliveries.map((delivery) => `${event.id}:${delivery.id}`);
  }

  retryWebhookDelivery(deliveryId: string) {
    return `retry:${deliveryId}`;
  }
}
