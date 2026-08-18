-- name: CreateUser :one
INSERT INTO users (email, password_hash, display_name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1;

-- name: GetUserDisplayName :one
-- Lighter than GetUserByID when you only need the name (e.g. enriching a
-- just-sent message with its author's name for the WS broadcast).
SELECT display_name FROM users
WHERE id = $1;