package warehouse

import (
	"testing"

	"example.com/inventory/inventory"
)

func TestExecuteMovesStock(t *testing.T) {
	item := inventory.NewStockItem("SKU-1", 100)
	dest := NewLocation("STORAGE")
	dest.AddBin("A1", 50)
	tr := Transfer{SKU: "SKU-1", From: NewLocation("RECEIVING"), To: dest}

	if err := tr.Execute(item, "A1", 40); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if item.Available() != 60 {
		t.Errorf("Available() = %d, want 60", item.Available())
	}
	if dest.Bins["A1"].Used != 40 {
		t.Errorf("Used = %d, want 40", dest.Bins["A1"].Used)
	}
}

func TestExecuteRollsBackOnFullBin(t *testing.T) {
	item := inventory.NewStockItem("SKU-1", 100)
	dest := NewLocation("STORAGE")
	dest.AddBin("A1", 10)
	tr := Transfer{SKU: "SKU-1", To: dest}

	if err := tr.Execute(item, "A1", 40); err == nil {
		t.Fatal("expected error when destination bin is full")
	}
	if item.Available() != 100 {
		t.Errorf("Available() = %d, want 100 after rollback", item.Available())
	}
}

func TestCanTransfer(t *testing.T) {
	item := inventory.NewStockItem("SKU-1", 30)
	dest := NewLocation("STORAGE")
	dest.AddBin("A1", 100)
	if !CanTransfer(item, dest, 20) {
		t.Error("expected transfer to be possible")
	}
	if CanTransfer(item, dest, 50) {
		t.Error("did not expect transfer beyond available stock")
	}
}
