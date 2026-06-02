import { WebhooksService } from "./webhooks.service";

export class WebhookQueueService {
  constructor(private readonly webhooks: WebhooksService) {}

  enqueueInboundEvent(inboundEventId: string) {
    return `inbound:${inboundEventId}`;
  }

  enqueueDelivery(deliveryId: string) {
    return this.webhooks.retryWebhookDelivery(deliveryId);
  }
}
