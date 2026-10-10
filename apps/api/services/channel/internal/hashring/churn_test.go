package hashring

import (
	"context"
	"fmt"
	"math/rand"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestConcurrentTrafficDuringNodeJoin(t *testing.T) {
	t.Run("traffic continues across join", func(t *testing.T) {
		ring := NewRing(100)
		ring.AddNode("core-1")
		keys := churnChannelIDs(500)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		var ready, observedPostChange, workers sync.WaitGroup
		ready.Add(50)
		observedPostChange.Add(50)
		workers.Add(50)
		defer func() {
			cancel()
			waitForStoppedWorkers(t, &workers)
		}()
		var changed atomic.Bool
		var errorsMu sync.Mutex
		var getErrors []error
		start := make(chan struct{})

		for worker := 0; worker < 50; worker++ {
			go func(seed int64) {
				defer workers.Done()
				rng := rand.New(rand.NewSource(seed))
				<-start
				started := false
				postChangeCalls := 0
				for {
					select {
					case <-ctx.Done():
						return
					default:
					}
					postChangeCall := changed.Load()
					_, err := ring.Get(keys[rng.Intn(len(keys))])
					if err != nil {
						errorsMu.Lock()
						getErrors = append(getErrors, err)
						errorsMu.Unlock()
					}
					if !started {
						started = true
						ready.Done()
					}
					if postChangeCall {
						postChangeCalls++
						if postChangeCalls == 100 {
							observedPostChange.Done()
						}
					}
				}
			}(int64(worker + 1))
		}
		close(start)
		waitForWaitGroup(t, ctx, &ready, "all traffic workers to start")
		ring.AddNode("core-2")
		changed.Store(true)
		waitForWaitGroup(t, ctx, &observedPostChange, "all workers to call Get after the join")
		cancel()
		waitForStoppedWorkers(t, &workers)

		errorsMu.Lock()
		defer errorsMu.Unlock()
		if len(getErrors) != 0 {
			t.Fatalf("Get returned %d errors during join traffic; first: %v", len(getErrors), getErrors[0])
		}
	})
}

func TestConcurrentTrafficDuringNodeDeath(t *testing.T) {
	t.Run("traffic continues after immediate removal", func(t *testing.T) {
		ring := NewRing(100)
		ring.AddNode("core-1")
		ring.AddNode("core-2")
		keys := churnChannelIDs(500)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		var ready, observedPostChange, workers sync.WaitGroup
		ready.Add(50)
		observedPostChange.Add(50)
		workers.Add(50)
		defer func() {
			cancel()
			waitForStoppedWorkers(t, &workers)
		}()
		var changed atomic.Bool
		var errorsMu sync.Mutex
		var getErrors []error
		var badOwners []string
		start := make(chan struct{})

		for worker := 0; worker < 50; worker++ {
			go func(seed int64) {
				defer workers.Done()
				rng := rand.New(rand.NewSource(seed + 1000))
				<-start
				started := false
				postChangeCalls := 0
				for {
					select {
					case <-ctx.Done():
						return
					default:
					}
					postChangeCall := changed.Load()
					owner, err := ring.Get(keys[rng.Intn(len(keys))])
					if err != nil {
						errorsMu.Lock()
						getErrors = append(getErrors, err)
						errorsMu.Unlock()
					} else if postChangeCall && owner != "core-1" {
						errorsMu.Lock()
						badOwners = append(badOwners, owner)
						errorsMu.Unlock()
					}
					if !started {
						started = true
						ready.Done()
					}
					if postChangeCall {
						postChangeCalls++
						if postChangeCalls == 100 {
							observedPostChange.Done()
						}
					}
				}
			}(int64(worker + 1))
		}
		close(start)
		waitForWaitGroup(t, ctx, &ready, "all traffic workers to start")
		ring.RemoveNode("core-2")
		changed.Store(true)
		waitForWaitGroup(t, ctx, &observedPostChange, "all workers to call Get after removal")
		cancel()
		waitForStoppedWorkers(t, &workers)

		errorsMu.Lock()
		defer errorsMu.Unlock()
		if len(getErrors) != 0 {
			t.Fatalf("Get returned %d errors during removal traffic; first: %v", len(getErrors), getErrors[0])
		}
		if len(badOwners) != 0 {
			t.Fatalf("Get returned owner %q after removal; only core-1 should remain", badOwners[0])
		}
	})
}

func TestNoChannelLosesOwnerAcrossJoinThenDeath(t *testing.T) {
	t.Run("ownership remains valid and returns to initial node", func(t *testing.T) {
		ring := NewRing(100)
		ring.AddNode("core-1")
		keys := churnChannelIDs(1000)

		before := snapshotOwners(t, ring, keys)
		ring.AddNode("core-2")
		afterJoin := snapshotOwners(t, ring, keys)
		ring.RemoveNode("core-2")
		afterDeath := snapshotOwners(t, ring, keys)

		for _, key := range keys {
			if before[key] == "" || afterJoin[key] == "" || afterDeath[key] == "" {
				t.Errorf("channel %q has empty owner across snapshots: before=%q join=%q death=%q", key, before[key], afterJoin[key], afterDeath[key])
				continue
			}
			if afterDeath[key] != before[key] {
				t.Errorf("channel %q owner after removal = %q, want initial owner %q", key, afterDeath[key], before[key])
			}
		}
	})
}

func churnChannelIDs(count int) []string {
	keys := make([]string, count)
	for i := range keys {
		keys[i] = fmt.Sprintf("channel-%04d", i)
	}
	return keys
}

func snapshotOwners(t *testing.T, ring *Ring, keys []string) map[string]string {
	t.Helper()
	owners := make(map[string]string, len(keys))
	for _, key := range keys {
		owner, err := ring.Get(key)
		if err != nil {
			t.Fatalf("Get(%q): %v", key, err)
		}
		if owner == "" {
			t.Fatalf("Get(%q) returned an empty owner", key)
		}
		owners[key] = owner
	}
	return owners
}

func waitForWaitGroup(t *testing.T, ctx context.Context, group *sync.WaitGroup, description string) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		group.Wait()
		close(done)
	}()
	for {
		select {
		case <-done:
			return
		case <-ctx.Done():
			t.Fatalf("timed out waiting for %s", description)
		default:
			runtime.Gosched()
		}
	}
}

func waitForStoppedWorkers(t *testing.T, workers *sync.WaitGroup) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	waitForWaitGroup(t, ctx, workers, "traffic workers to stop")
}
