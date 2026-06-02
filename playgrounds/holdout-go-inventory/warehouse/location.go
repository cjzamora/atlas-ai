package warehouse

import (
	"errors"
	"fmt"
)

// ErrBinFull is returned when a bin cannot accept additional units.
var ErrBinFull = errors.New("warehouse: bin is at capacity")

// Bin is a discrete storage location identified by aisle, shelf, and slot.
type Bin struct {
	ID       string
	Capacity int
	Used     int
}

// Location groups a set of bins within a named zone of the warehouse.
type Location struct {
	Zone string
	Bins map[string]*Bin
}

// NewLocation creates an empty location for the given zone.
func NewLocation(zone string) *Location {
	return &Location{Zone: zone, Bins: make(map[string]*Bin)}
}

// AddBin registers a bin in the location with the given capacity.
func (l *Location) AddBin(id string, capacity int) *Bin {
	b := &Bin{ID: id, Capacity: capacity}
	l.Bins[id] = b
	return b
}

// Assign places qty units into the named bin, failing if capacity is exceeded.
func (l *Location) Assign(binID string, qty int) error {
	b, ok := l.Bins[binID]
	if !ok {
		return fmt.Errorf("warehouse: unknown bin %q", binID)
	}
	if b.Used+qty > b.Capacity {
		return ErrBinFull
	}
	b.Used += qty
	return nil
}

// FreeSpace returns the remaining capacity across all bins in the location.
func (l *Location) FreeSpace() int {
	free := 0
	for _, b := range l.Bins {
		free += b.Capacity - b.Used
	}
	return free
}
