package main

import (
	"fmt"

	"example.com/inventory/inventory"
	"example.com/inventory/warehouse"
)

func main() {
	// Seed a stock item and a reorder policy.
	widget := inventory.NewStockItem("WIDGET-001", 120)
	policy := inventory.ReorderPolicy{
		SKU:             "WIDGET-001",
		LeadTimeDays:    7,
		DailyDemand:     10,
		SafetyStock:     15,
		ReorderQuantity: 200,
	}

	fmt.Printf("reorder point for %s: %d\n", policy.SKU, policy.ReorderPoint())
	if inventory.NeedsReorder(widget, policy) {
		fmt.Printf("reorder %d units\n", inventory.SuggestReorderQuantity(widget, policy))
	}

	// Set up warehouse locations and a transfer between them.
	receiving := warehouse.NewLocation("RECEIVING")
	storage := warehouse.NewLocation("STORAGE")
	storage.AddBin("A1-S2-01", 100)

	move := warehouse.Transfer{SKU: widget.SKU, From: receiving, To: storage}
	if warehouse.CanTransfer(widget, storage, 50) {
		if err := move.Execute(widget, "A1-S2-01", 50); err != nil {
			fmt.Println("transfer error:", err)
			return
		}
	}

	fmt.Printf("available after transfer: %d\n", widget.Available())
	fmt.Printf("storage free space: %d\n", storage.FreeSpace())
}
