import { WebhookQueueService } from "../webhook-queue.service";
import { WebhooksService } from "../webhooks.service";

export function webhookQueueServiceSpec() {
  const queue = new WebhookQueueService(new WebhooksService());
  return queue.enqueueDelivery("delivery_123");
}
