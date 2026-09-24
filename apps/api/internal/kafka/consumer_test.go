package kafka

import (
	"testing"
)

func TestEventDedupKeyUsesEventID(t *testing.T) {
	payload := []byte(`{"event_id":"evt-1","message_id":"msg-42","content":"hello"}`)
	key, err := EventDedupKey(TopicMessageEdited, payload)
	if err != nil {
		t.Fatalf("EventDedupKey returned error: %v", err)
	}
	if key != "evt-1" {
		t.Fatalf("expected event id to be used, got %q", key)
	}
}

func TestEventDedupKeySeparatesSameMessageDifferentEvents(t *testing.T) {
	p1 := []byte(`{"event_id":"evt-1","message_id":"msg-42","content":"first"}`)
	p2 := []byte(`{"event_id":"evt-2","message_id":"msg-42","content":"second"}`)
	k1, err := EventDedupKey(TopicMessageEdited, p1)
	if err != nil {
		t.Fatalf("first key error: %v", err)
	}
	k2, err := EventDedupKey(TopicMessageEdited, p2)
	if err != nil {
		t.Fatalf("second key error: %v", err)
	}
	if k1 == k2 {
		t.Fatalf("dedup keys should differ for distinct event IDs: %q == %q", k1, k2)
	}
}

func TestEventDedupKeySeparatesSameReactionDifferentEvents(t *testing.T) {
	p1 := []byte(`{"event_id":"evt-1","reaction_id":"rxn-9","emoji":":+1:"}`)
	p2 := []byte(`{"event_id":"evt-2","reaction_id":"rxn-9","emoji":":+1:"}`)
	k1, err := EventDedupKey(TopicReactionAdded, p1)
	if err != nil {
		t.Fatalf("first key error: %v", err)
	}
	k2, err := EventDedupKey(TopicReactionAdded, p2)
	if err != nil {
		t.Fatalf("second key error: %v", err)
	}
	if k1 == k2 {
		t.Fatalf("dedup keys should differ for distinct event IDs: %q == %q", k1, k2)
	}
}

func TestEventDedupKeySeparatesSameUserDifferentEvents(t *testing.T) {
	p1 := []byte(`{"event_id":"evt-1","user_id":"user-7","display_name":"Alice"}`)
	p2 := []byte(`{"event_id":"evt-2","user_id":"user-7","display_name":"Alice"}`)
	k1, err := EventDedupKey(TopicUserRegistered, p1)
	if err != nil {
		t.Fatalf("first key error: %v", err)
	}
	k2, err := EventDedupKey(TopicUserRegistered, p2)
	if err != nil {
		t.Fatalf("second key error: %v", err)
	}
	if k1 == k2 {
		t.Fatalf("dedup keys should differ for distinct event IDs: %q == %q", k1, k2)
	}
}

func TestLegacyEventDedupKeyDeterministic(t *testing.T) {
	payload := []byte(`{"message_id":"msg-42","content":"legacy"}`)
	k1, err := EventDedupKey(TopicMessageEdited, payload)
	if err != nil {
		t.Fatalf("first legacy key error: %v", err)
	}
	k2, err := EventDedupKey(TopicMessageEdited, payload)
	if err != nil {
		t.Fatalf("second legacy key error: %v", err)
	}
	if k1 == "" || k2 == "" {
		t.Fatal("legacy dedup key should not be empty")
	}
	if k1 != k2 {
		t.Fatalf("legacy dedup keys should be stable for identical payloads: %q != %q", k1, k2)
	}
}

func TestLegacyEventDedupKeyDifferentPayloadsDiffer(t *testing.T) {
	p1 := []byte(`{"message_id":"msg-42","content":"legacy-a"}`)
	p2 := []byte(`{"message_id":"msg-42","content":"legacy-b"}`)
	k1, err := EventDedupKey(TopicMessageEdited, p1)
	if err != nil {
		t.Fatalf("first key error: %v", err)
	}
	k2, err := EventDedupKey(TopicMessageEdited, p2)
	if err != nil {
		t.Fatalf("second key error: %v", err)
	}
	if k1 == k2 {
		t.Fatalf("different legacy payloads should yield different dedup keys: %q == %q", k1, k2)
	}
}
