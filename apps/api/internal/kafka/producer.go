package kafka

import (
	"context"
	"encoding/json"
	"time"

	"github.com/segmentio/kafka-go"
)

type Producer struct {
	writer *kafka.Writer
}

func NewProducer(brokerAddr string) *Producer {
	return &Producer{
		writer: &kafka.Writer{
			Addr: kafka.TCP(brokerAddr),
			// Same key -> same partition, so events about the same channel
			// (or user) stay in order relative to each other.
			Balancer:     &kafka.Hash{},
			RequiredAcks: kafka.RequireOne,
			WriteTimeout: 5 * time.Second,
		},
	}
}

// Publish marshals value as JSON and writes it to topic, keyed by key.
func (p *Producer) Publish(ctx context.Context, topic, key string, value any) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return p.writer.WriteMessages(ctx, kafka.Message{
		Topic: topic,
		Key:   []byte(key),
		Value: body,
	})
}

func (p *Producer) Close() error {
	return p.writer.Close()
}