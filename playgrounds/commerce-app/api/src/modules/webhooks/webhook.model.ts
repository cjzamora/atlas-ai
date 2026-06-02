export type WebhookEvent = {
  id: string;
  provider: "stripe" | "ledger";
  eventType: string;
  payload: unknown;
};

export type WebhookDelivery = {
  id: string;
  endpointUrl: string;
  attemptCount: number;
};
