import { WebhookQueueService } from "../../webhooks/webhook-queue.service";
import { WebhooksService } from "../../webhooks/webhooks.service";

export class StripeWebhookService {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly queue: WebhookQueueService
  ) {}

  verifyStripeWebhookSignature(rawBody: string, signature: string) {
    return signature.startsWith("whsec_") && rawBody.length > 0;
  }

  recordStripeInboundEvent(rawBody: string, signature: string) {
    if (!this.verifyStripeWebhookSignature(rawBody, signature)) {
      throw new Error("Invalid Stripe webhook signature");
    }
    const inbound = this.webhooks.recordInboundProviderEvent({
      id: "evt_stripe",
      provider: "stripe",
      eventType: "payment_intent.succeeded",
      payload: rawBody
    });
    return this.queue.enqueueInboundEvent(inbound.record.id);
  }
}
