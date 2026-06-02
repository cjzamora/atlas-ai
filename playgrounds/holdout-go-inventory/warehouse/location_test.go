package warehouse

import "testing"

func TestAssignWithinCapacity(t *testing.T) {
	loc := NewLocation("STORAGE")
	loc.AddBin("A1", 50)
	if err := loc.Assign("A1", 30); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if loc.Bins["A1"].Used != 30 {
		t.Errorf("Used = %d, want 30", loc.Bins["A1"].Used)
	}
}

func TestAssignOverCapacityFails(t *testing.T) {
	loc := NewLocation("STORAGE")
	loc.AddBin("A1", 10)
	if err := loc.Assign("A1", 25); err != ErrBinFull {
		t.Errorf("err = %v, want ErrBinFull", err)
	}
}

func TestAssignUnknownBin(t *testing.T) {
	loc := NewLocation("STORAGE")
	if err := loc.Assign("NOPE", 1); err == nil {
		t.Error("expected error for unknown bin")
	}
}

func TestFreeSpace(t *testing.T) {
	loc := NewLocation("STORAGE")
	loc.AddBin("A1", 40)
	loc.AddBin("A2", 60)
	_ = loc.Assign("A1", 10)
	if got := loc.FreeSpace(); got != 90 {
		t.Errorf("FreeSpace() = %d, want 90", got)
	}
}
