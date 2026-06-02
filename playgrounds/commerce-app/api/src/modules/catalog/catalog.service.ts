import type { Product } from "./product.model";

export class CatalogService {
  listAvailableProducts(products: Product[]) {
    return products.filter((product) =>
      product.variants.some((variant) => variant.inventoryCount > 0)
    );
  }

  reserveInventory(product: Product, sku: string) {
    return product.variants.find((variant) => variant.sku === sku && variant.inventoryCount > 0);
  }
}
