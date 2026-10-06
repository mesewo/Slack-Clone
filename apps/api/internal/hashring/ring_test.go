package hashring

import (
	"fmt"
	"math/rand"
	"testing"
)

func TestDistribution(t *testing.T) {
	const (
		nodeCount = 10
		keyCount  = 10_000
	)
	ring := NewRing(100)
	for i := 0; i < nodeCount; i++ {
		ring.AddNode(fmt.Sprintf("node-%02d", i))
	}

	counts := make(map[string]int, nodeCount)
	for _, key := range randomKeys(1, keyCount) {
		node, err := ring.Get(key)
		if err != nil {
			t.Fatalf("Get(%q): %v", key, err)
		}
		counts[node]++
	}

	average := float64(keyCount) / nodeCount
	for i := 0; i < nodeCount; i++ {
		node := fmt.Sprintf("node-%02d", i)
		if float64(counts[node]) > 2*average {
			t.Errorf("node %s owns %d keys, above 2x average %.0f", node, counts[node], 2*average)
		}
	}
}

func TestMinimalRemapping(t *testing.T) {
	const (
		initialNodeCount = 10
		keyCount         = 10_000
	)
	ring := NewRing(100)
	for i := 0; i < initialNodeCount; i++ {
		ring.AddNode(fmt.Sprintf("node-%02d", i))
	}

	keys := randomKeys(2, keyCount)
	owners := make(map[string]string, keyCount)
	for _, key := range keys {
		node, err := ring.Get(key)
		if err != nil {
			t.Fatalf("Get(%q) before adding node: %v", key, err)
		}
		owners[key] = node
	}

	ring.AddNode("node-new")
	moved := 0
	for _, key := range keys {
		after, err := ring.Get(key)
		if err != nil {
			t.Fatalf("Get(%q) after adding node: %v", key, err)
		}
		if after != owners[key] {
			moved++
			if after != "node-new" {
				t.Errorf("key %q moved from %s to existing node %s", key, owners[key], after)
			}
		}
	}

	share := float64(moved) / keyCount
	t.Logf("adding a node moved %.2f%% of keys (expected roughly %.2f%%)", share*100, 100.0/(initialNodeCount+1))
	if share < 0.04 || share > 0.16 {
		t.Fatalf("adding an 11th node moved %.2f%% of keys; expected roughly %.2f%%", share*100, 100.0/(initialNodeCount+1))
	}
}

func TestRemoveNodeRedistributesOnlyItsKeys(t *testing.T) {
	const (
		nodeCount = 10
		keyCount  = 10_000
		removed   = "node-04"
	)
	ring := NewRing(100)
	for i := 0; i < nodeCount; i++ {
		ring.AddNode(fmt.Sprintf("node-%02d", i))
	}

	keys := randomKeys(3, keyCount)
	owners := make(map[string]string, keyCount)
	ownedByRemoved := 0
	for _, key := range keys {
		node, err := ring.Get(key)
		if err != nil {
			t.Fatalf("Get(%q) before removing node: %v", key, err)
		}
		owners[key] = node
		if node == removed {
			ownedByRemoved++
		}
	}

	ring.RemoveNode(removed)
	moved := 0
	for _, key := range keys {
		after, err := ring.Get(key)
		if err != nil {
			t.Fatalf("Get(%q) after removing node: %v", key, err)
		}
		before := owners[key]
		if before == removed {
			moved++
			if after == removed {
				t.Errorf("key %q remains assigned to removed node", key)
			}
		} else if after != before {
			t.Errorf("key %q moved from unaffected node %s to %s", key, before, after)
		}
	}
	if moved != ownedByRemoved {
		t.Fatalf("moved %d keys, but removed node previously owned %d sampled keys", moved, ownedByRemoved)
	}
}

func TestEmptyRingReturnsError(t *testing.T) {
	if _, err := NewRing(100).Get("key"); err != ErrEmptyRing {
		t.Fatalf("Get on empty ring error = %v, want %v", err, ErrEmptyRing)
	}
}

func randomKeys(seed int64, count int) []string {
	rng := rand.New(rand.NewSource(seed))
	keys := make([]string, count)
	for i := range keys {
		keys[i] = fmt.Sprintf("key-%016x-%d", rng.Uint64(), i)
	}
	return keys
}
