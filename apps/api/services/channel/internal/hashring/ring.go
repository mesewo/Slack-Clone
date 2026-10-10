package hashring

import (
	"errors"
	"sort"
	"strconv"
	"sync"

	"github.com/cespare/xxhash/v2"
)

var ErrEmptyRing = errors.New("hash ring is empty")

type point struct {
	hash   uint64
	nodeID string
}

type Ring struct {
	mu                  sync.RWMutex
	virtualNodesPerNode int
	points              []point
	nodes               map[string]struct{}
}

func NewRing(virtualNodesPerNode int) *Ring {
	return &Ring{
		virtualNodesPerNode: virtualNodesPerNode,
		nodes:               make(map[string]struct{}),
	}
}

func (r *Ring) AddNode(nodeID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.nodes[nodeID]; exists {
		return
	}
	r.nodes[nodeID] = struct{}{}

	for i := 0; i < r.virtualNodesPerNode; i++ {
		r.points = append(r.points, point{
			hash:   xxhash.Sum64String(nodeID + "#" + strconv.Itoa(i)),
			nodeID: nodeID,
		})
	}
	sort.Slice(r.points, func(i, j int) bool {
		if r.points[i].hash == r.points[j].hash {
			return r.points[i].nodeID < r.points[j].nodeID
		}
		return r.points[i].hash < r.points[j].hash
	})
}

func (r *Ring) RemoveNode(nodeID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.nodes[nodeID]; !exists {
		return
	}
	delete(r.nodes, nodeID)

	remaining := r.points[:0]
	for _, p := range r.points {
		if p.nodeID != nodeID {
			remaining = append(remaining, p)
		}
	}
	r.points = remaining
}

func (r *Ring) Get(key string) (string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if len(r.points) == 0 {
		return "", ErrEmptyRing
	}

	keyHash := xxhash.Sum64String(key)
	index := sort.Search(len(r.points), func(i int) bool {
		return r.points[i].hash >= keyHash
	})
	if index == len(r.points) {
		index = 0
	}
	return r.points[index].nodeID, nil
}
