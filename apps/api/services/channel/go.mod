module github.com/mesewo/slack-clone/services/channel

go 1.26.5

require (
	github.com/cespare/xxhash/v2 v2.3.0
	github.com/mesewo/slack-clone/services/contracts v0.0.0
	github.com/mesewo/slack-clone/services/telemetry v0.0.0
	google.golang.org/grpc v1.83.2
)

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/go-chi/chi/v5 v5.3.1 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/prometheus/client_golang v1.23.2 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.66.1 // indirect
	github.com/prometheus/procfs v0.16.1 // indirect
	go.uber.org/multierr v1.10.0 // indirect
	go.uber.org/zap v1.27.0 // indirect
	go.yaml.in/yaml/v2 v2.4.2 // indirect
	golang.org/x/net v0.58.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.41.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260526163538-3dc84a4a5aaa // indirect
	google.golang.org/protobuf v1.36.12 // indirect
)

replace github.com/mesewo/slack-clone/services/contracts => ../contracts

replace github.com/mesewo/slack-clone/services/telemetry => ../telemetry
