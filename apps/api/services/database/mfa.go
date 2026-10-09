package database

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var (
	ErrMFAAlreadyEnabled = errors.New("MFA is already enabled")
	ErrMFASetupChanged   = errors.New("MFA setup changed before confirmation")
)

func (q *Queries) SetUserMFASecret(ctx context.Context, userID uuid.UUID, secret string) error {
	tag, err := q.db.Exec(ctx, `
		UPDATE users SET mfa_secret = $1
		WHERE id = $2 AND mfa_enabled = false
	`, secret, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrMFAAlreadyEnabled
	}
	return nil
}

func (q *Queries) EnableUserMFA(ctx context.Context, userID uuid.UUID, secret string) error {
	tag, err := q.db.Exec(ctx, `
		UPDATE users SET mfa_enabled = true
		WHERE id = $1 AND mfa_secret = $2 AND mfa_enabled = false
	`, userID, secret)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrMFASetupChanged
	}
	return nil
}
