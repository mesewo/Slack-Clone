package kafka

import (
	"context"
	"encoding/json"
	"time"

	"github.com/segmentio/kafka-go"
)

type Producer struct{ writer *kafka.Writer }

func NewProducer(brokerAddr string) *Producer {
	return &Producer{writer: &kafka.Writer{
		Addr: kafka.TCP(brokerAddr), Balancer: &kafka.Hash{}, RequiredAcks: kafka.RequireOne, WriteTimeout: 5 * time.Second,
	}}
}

func (p *Producer) Publish(ctx context.Context, topic, key string, value any) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return p.PublishRaw(ctx, topic, key, body)
}

func (p *Producer) PublishRaw(ctx context.Context, topic, key string, body []byte) error {
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		err = p.writer.WriteMessages(ctx, kafka.Message{Topic: topic, Key: []byte(key), Value: body})
		if err == nil {
			return nil
		}
		if attempt < 2 {
			timer := time.NewTimer(time.Duration(attempt+1) * 100 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
		}
	}
	return err
}

func (p *Producer) Close() error { return p.writer.Close() }
