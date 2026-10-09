package totp

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	stepDuration = 30 * time.Second
	codeDigits   = 6
)

var errInvalidSecret = errors.New("invalid TOTP secret")

func GenerateSecret() (string, error) {
	secret := make([]byte, 20)
	if _, err := rand.Read(secret); err != nil {
		return "", fmt.Errorf("generate TOTP secret: %w", err)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secret), nil
}

func GenerateCode(secret string, t time.Time) (string, error) {
	key, err := decodeSecret(secret)
	if err != nil {
		return "", err
	}
	if t.Unix() < 0 {
		return "", errors.New("TOTP time must not be before Unix epoch")
	}
	return codeForStep(key, t.Unix()/int64(stepDuration/time.Second)), nil
}

func Verify(secret, code string, t time.Time) bool {
	_, ok := VerifyWithStep(secret, code, t)
	return ok
}

// VerifyWithStep returns the matched RFC 6238 time-step so callers can enforce
// replay protection separately from the clock-drift window.
func VerifyWithStep(secret, code string, t time.Time) (int64, bool) {
	if len(code) != codeDigits || t.Unix() < 0 {
		return 0, false
	}
	for _, digit := range code {
		if digit < '0' || digit > '9' {
			return 0, false
		}
	}
	key, err := decodeSecret(secret)
	if err != nil {
		return 0, false
	}
	currentStep := t.Unix() / int64(stepDuration/time.Second)
	for _, candidate := range []int64{currentStep, currentStep - 1, currentStep + 1} {
		if candidate < 0 {
			continue
		}
		want := codeForStep(key, candidate)
		if subtle.ConstantTimeCompare([]byte(code), []byte(want)) == 1 {
			return candidate, true
		}
	}
	return 0, false
}

func decodeSecret(secret string) ([]byte, error) {
	if secret == "" {
		return nil, errInvalidSecret
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secret))
	if err != nil || len(key) == 0 {
		return nil, errInvalidSecret
	}
	return key, nil
}

func codeForStep(secret []byte, step int64) string {
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(step))
	mac := hmac.New(sha1.New, secret)
	_, _ = mac.Write(counter[:])
	digest := mac.Sum(nil)
	offset := digest[len(digest)-1] & 0x0f
	value := binary.BigEndian.Uint32(digest[offset:offset+4]) & 0x7fffffff
	modulus := uint32(1)
	for i := 0; i < codeDigits; i++ {
		modulus *= 10
	}
	return fmt.Sprintf("%06d", value%modulus)
}
