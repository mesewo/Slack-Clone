-- +goose Up

ALTER TABLE users
    ADD COLUMN mfa_secret VARCHAR(64),
    ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT false;

-- +goose Down

ALTER TABLE users
    DROP COLUMN mfa_enabled,
    DROP COLUMN mfa_secret;
