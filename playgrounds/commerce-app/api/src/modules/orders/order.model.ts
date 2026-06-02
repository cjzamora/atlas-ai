export type Order = {
  id: string;
  cartId: string;
  fulfillmentStatus: "pending" | "packed" | "shipped";
};
