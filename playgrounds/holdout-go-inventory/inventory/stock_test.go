package inventory

import "testing"

func TestAddIncreasesOnHand(t *testing.T) {
	item := NewStockItem("SKU-1", 10)
	if err := item.Add(5); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if item.OnHand != 15 {
		t.Errorf("OnHand = %d, want 15", item.OnHand)
	}
}

func TestRemoveReducesAvailable(t *testing.T) {
	item := NewStockItem("SKU-1", 10)
	if err := item.Remove(4); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if item.Available() != 6 {
		t.Errorf("Available() = %d, want 6", item.Available())
	}
}

func TestRemoveBeyondAvailableFails(t *testing.T) {
	item := NewStockItem("SKU-1", 3)
	if err := item.Remove(5); err != ErrInsufficientStock {
		t.Errorf("err = %v, want ErrInsufficientStock", err)
	}
}

func TestAvailableSubtractsAllocated(t *testing.T) {
	item := &StockItem{SKU: "SKU-1", OnHand: 20, Allocated: 8}
	if item.Available() != 12 {
		t.Errorf("Available() = %d, want 12", item.Available())
	}
}
