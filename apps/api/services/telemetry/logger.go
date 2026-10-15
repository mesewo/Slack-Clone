package telemetry

import (
	"os"

	"go.uber.org/zap"
)

// L is a safe no-op logger until a binary installs its service logger.
var L = zap.NewNop()

func NewLogger(serviceName string) *zap.Logger {
	config := zap.NewProductionConfig()
	if os.Getenv("LOG_FORMAT") == "console" {
		config = zap.NewDevelopmentConfig()
	}
	config.InitialFields = map[string]interface{}{"service": serviceName}
	logger, err := config.Build()
	if err != nil {
		return zap.NewNop()
	}
	return logger
}

func SetDefault(logger *zap.Logger) {
	if logger == nil {
		L = zap.NewNop()
		return
	}
	L = logger
}
