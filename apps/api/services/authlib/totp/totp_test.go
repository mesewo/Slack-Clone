package totp

import (
	"encoding/base32"
	"testing"
	"time"
)

func TestRFC6238AppendixB_SHA1SixDigitCodes(t *testing.T) {
	// Appendix B's ASCII shared secret is the HMAC key bytes. Encode those same
	// bytes here because the package API accepts the interoperable Base32 form.
	secretBytes := []byte("12345678901234567890")
	secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secretBytes)
	tests := []struct {
		unixTime int64
		code     string
	}{
		{unixTime: 59, code: "287082"},
		{unixTime: 1111111109, code: "081804"},
		{unixTime: 1111111111, code: "050471"},
		{unixTime: 1234567890, code: "005924"},
		{unixTime: 2000000000, code: "279037"},
		{unixTime: 20000000000, code: "353130"},
	}
	for _, test := range tests {
		t.Run(time.Unix(test.unixTime, 0).UTC().Format("20060102T150405Z"), func(t *testing.T) {
			code, err := GenerateCode(secret, time.Unix(test.unixTime, 0))
			if err != nil {
				t.Fatal(err)
			}
			if code != test.code {
				t.Fatalf("GenerateCode() = %q, want RFC 6238 six-digit code %q", code, test.code)
			}
		})
	}
}

func TestGenerateSecretIsTwentyRandomBytes(t *testing.T) {
	secret, err := GenerateSecret()
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		t.Fatalf("generated secret is invalid base32: %v", err)
	}
	if len(decoded) != 20 {
		t.Fatalf("decoded secret length = %d, want 20 bytes", len(decoded))
	}
}

func TestVerifyAllowsOneStepClockDrift(t *testing.T) {
	secret, err := GenerateSecret()
	if err != nil {
		t.Fatal(err)
	}
	center := time.Unix(1_700_000_010, 0)
	for _, offset := range []time.Duration{-30 * time.Second, 0, 30 * time.Second} {
		code, err := GenerateCode(secret, center.Add(offset))
		if err != nil {
			t.Fatal(err)
		}
		if !Verify(secret, code, center) {
			t.Errorf("Verify rejected code for offset %s", offset)
		}
	}
}

func TestVerifyRejectsCodeTwoStepsAway(t *testing.T) {
	secret, err := GenerateSecret()
	if err != nil {
		t.Fatal(err)
	}
	center := time.Unix(1_700_000_010, 0)
	code, err := GenerateCode(secret, center.Add(60*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if Verify(secret, code, center) {
		t.Fatal("Verify accepted code two steps away")
	}
}

func TestMalformedSecretReturnsError(t *testing.T) {
	for _, secret := range []string{"", "!invalid!", "a"} {
		if _, err := GenerateCode(secret, time.Unix(59, 0)); err == nil {
			t.Errorf("GenerateCode(%q) succeeded, want error", secret)
		}
		if Verify(secret, "287082", time.Unix(59, 0)) {
			t.Errorf("Verify(%q, ...) succeeded for malformed secret", secret)
		}
	}
}

func TestGenerateCodeRejectsMalformedCodeOnVerify(t *testing.T) {
	secret, err := GenerateSecret()
	if err != nil {
		t.Fatal(err)
	}
	for _, code := range []string{"", "12345", "1234567", "12a456"} {
		if Verify(secret, code, time.Unix(59, 0)) {
			t.Errorf("Verify accepted malformed code %q", code)
		}
	}
}
