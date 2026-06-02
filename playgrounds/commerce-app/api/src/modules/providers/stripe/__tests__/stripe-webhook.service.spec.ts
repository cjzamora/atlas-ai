import { StripeWebhookService } from "../stripe-webhook.service";
import { WebhookQueueService } from "../../../webhooks/webhook-queue.service";
import { WebhooksService } from "../../../webhooks/webhooks.service";

export function stripeWebhookServiceSpec() {
  const webhooks = new WebhooksService();
  const queue = new WebhookQueueService(webhooks);
  const service = new StripeWebhookService(webhooks, queue);
  return service.verifyStripeWebhookSignature("{}", "whsec_test");
}
