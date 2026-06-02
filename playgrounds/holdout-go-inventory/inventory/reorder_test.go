package inventory

import "testing"

func TestReorderPoint(t *testing.T) {
	policy := ReorderPolicy{LeadTimeDays: 5, DailyDemand: 10, SafetyStock: 20}
	if got := policy.ReorderPoint(); got != 70 {
		t.Errorf("ReorderPoint() = %d, want 70", got)
	}
}

func TestNeedsReorderAtOrBelowThreshold(t *testing.T) {
	policy := ReorderPolicy{LeadTimeDays: 2, DailyDemand: 5, SafetyStock: 0}
	low := NewStockItem("SKU-1", 10)
	if !NeedsReorder(low, policy) {
		t.Error("expected reorder when at threshold")
	}
	high := NewStockItem("SKU-1", 50)
	if NeedsReorder(high, policy) {
		t.Error("did not expect reorder when above threshold")
	}
}

func TestSuggestReorderQuantity(t *testing.T) {
	policy := ReorderPolicy{LeadTimeDays: 2, DailyDemand: 5, SafetyStock: 0, ReorderQuantity: 100}
	low := NewStockItem("SKU-1", 5)
	if got := SuggestReorderQuantity(low, policy); got != 100 {
		t.Errorf("SuggestReorderQuantity() = %d, want 100", got)
	}
	high := NewStockItem("SKU-1", 80)
	if got := SuggestReorderQuantity(high, policy); got != 0 {
		t.Errorf("SuggestReorderQuantity() = %d, want 0", got)
	}
}
