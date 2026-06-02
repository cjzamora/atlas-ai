package inventory

// ReorderPolicy describes when and how much to reorder for a SKU.
type ReorderPolicy struct {
	SKU            string
	LeadTimeDays   int
	DailyDemand    int
	SafetyStock    int
	ReorderQuantity int
}

// ReorderPoint computes the stock threshold at which a replenishment order
// should be placed: expected demand over the lead time plus safety stock.
func (p ReorderPolicy) ReorderPoint() int {
	return p.LeadTimeDays*p.DailyDemand + p.SafetyStock
}

// NeedsReorder reports whether the given stock item has dropped to or below
// its reorder point and should trigger a replenishment order.
func NeedsReorder(item *StockItem, policy ReorderPolicy) bool {
	if item == nil {
		return false
	}
	return item.Available() <= policy.ReorderPoint()
}

// SuggestReorderQuantity returns the quantity to order when a reorder is due.
// It returns zero when no reorder is needed.
func SuggestReorderQuantity(item *StockItem, policy ReorderPolicy) int {
	if !NeedsReorder(item, policy) {
		return 0
	}
	qty := policy.ReorderQuantity
	if qty <= 0 {
		// Fall back to topping up to twice the reorder point.
		qty = 2*policy.ReorderPoint() - item.Available()
	}
	if qty < 0 {
		return 0
	}
	return qty
}
