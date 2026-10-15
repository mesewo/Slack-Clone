docker rm -f slack-clone-demo 2>$null

docker run -d --name slack-clone-demo `
  --network slack-clone_default `
  -p 10000:10000 `
  --env-file apps/api/.env `
  -e KAFKA_BROKER_ADDR=redpanda:9092 `
  -e ELASTICSEARCH_URL=http://elasticsearch:9200 `
  slack-clone/demo:local
