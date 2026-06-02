package inventory

import (
	"errors"
	"fmt"
)

// ErrInsufficientStock is returned when a removal exceeds the on-hand quantity.
var ErrInsufficientStock = errors.New("inventory: insufficient stock")

// StockItem tracks the on-hand quantity for a single SKU.
type StockItem struct {
	SKU       string
	OnHand    int
	Allocated int
}

// NewStockItem constructs a StockItem with a starting quantity.
func NewStockItem(sku string, onHand int) *StockItem {
	return &StockItem{SKU: sku, OnHand: onHand}
}

// Add increases the on-hand quantity by the given amount.
func (s *StockItem) Add(qty int) error {
	if qty < 0 {
		return fmt.Errorf("inventory: cannot add negative quantity %d", qty)
	}
	s.OnHand += qty
	return nil
}

// Remove decreases the on-hand quantity, failing if not enough is available.
func (s *StockItem) Remove(qty int) error {
	if qty < 0 {
		return fmt.Errorf("inventory: cannot remove negative quantity %d", qty)
	}
	if qty > s.Available() {
		return ErrInsufficientStock
	}
	s.OnHand -= qty
	return nil
}

// Available returns the unallocated quantity that can be picked or shipped.
func (s *StockItem) Available() int {
	avail := s.OnHand - s.Allocated
	if avail < 0 {
		return 0
	}
	return avail
}
