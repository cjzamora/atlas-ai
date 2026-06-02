export type ProductVariant = {
  sku: string;
  priceCents: number;
  inventoryCount: number;
};

export type Product = {
  id: string;
  slug: string;
  variants: ProductVariant[];
};
