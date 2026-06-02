import { WebhooksService } from "../webhooks.service";

export function webhooksServiceSpec() {
  const service = new WebhooksService();
  return service.recordInboundProviderEvent({
    id: "evt_123",
    provider: "stripe",
    eventType: "payment_intent.succeeded",
    payload: {}
  });
}
