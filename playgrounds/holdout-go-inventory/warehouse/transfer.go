package warehouse

import (
	"fmt"

	"example.com/inventory/inventory"
)

// Transfer moves stock for a SKU between two locations, updating both the
// inventory stock record and the destination bin assignment.
type Transfer struct {
	SKU  string
	From *Location
	To   *Location
}

// Execute removes qty from the source stock item and assigns it into the
// destination bin. It rolls back the stock change if the bin cannot accept it.
func (t Transfer) Execute(item *inventory.StockItem, destBin string, qty int) error {
	if qty <= 0 {
		return fmt.Errorf("warehouse: transfer quantity must be positive, got %d", qty)
	}
	if err := item.Remove(qty); err != nil {
		return fmt.Errorf("warehouse: source removal failed: %w", err)
	}
	if err := t.To.Assign(destBin, qty); err != nil {
		// Roll back the stock removal so the record stays consistent.
		_ = item.Add(qty)
		return fmt.Errorf("warehouse: destination assign failed: %w", err)
	}
	return nil
}

// CanTransfer reports whether a transfer of qty units is currently possible
// given available stock and destination free space.
func CanTransfer(item *inventory.StockItem, dest *Location, qty int) bool {
	if item == nil || dest == nil || qty <= 0 {
		return false
	}
	return item.Available() >= qty && dest.FreeSpace() >= qty
}
