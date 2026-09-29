package database

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type txBeginner interface {
	Begin(context.Context) (pgx.Tx, error)
}

// InTx runs fn with queries bound to a transaction and commits on success.
func (q *Queries) InTx(ctx context.Context, fn func(*Queries) error) error {
	beginner, ok := q.db.(txBeginner)
	if !ok {
		return pgx.ErrTxClosed
	}

	tx, err := beginner.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := fn(q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
