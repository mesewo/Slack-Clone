.PHONY: migrate-up migrate-down sqlc

# Requires DATABASE_URL env var, e.g.
# postgres://postgres:postgrespassword@localhost:5432/slack_db?sslmode=disable
migrate-up:
	goose -dir sql/schema postgres "$(DATABASE_URL)" up

migrate-down:
	goose -dir sql/schema postgres "$(DATABASE_URL)" down

sqlc:
	sqlc generate