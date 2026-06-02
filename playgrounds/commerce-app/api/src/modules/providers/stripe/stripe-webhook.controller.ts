import { StripeWebhookService } from "./stripe-webhook.service";

export class StripeWebhookController {
  constructor(private readonly stripeWebhook: StripeWebhookService) {}

  receiveStripeWebhook(rawBody: string, signature: string) {
    return this.stripeWebhook.verifyStripeWebhookSignature(rawBody, signature);
  }
}
