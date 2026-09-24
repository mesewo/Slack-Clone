package gateway

import "testing"

func TestOriginAllowedUsesConfiguredOrigins(t *testing.T) {
	ConfigureAllowedOrigins([]string{"http://localhost:3000", "https://example.test/"})
	for _, origin := range []string{"http://localhost:3000", "https://example.test"} {
		if !originAllowed(origin) {
			t.Fatalf("expected origin %q to be allowed", origin)
		}
	}
	for _, origin := range []string{"https://evil.test", "not-an-origin"} {
		if originAllowed(origin) {
			t.Fatalf("expected origin %q to be rejected", origin)
		}
	}
	if !originAllowed("") {
		t.Fatal("expected non-browser requests without Origin to remain usable")
	}
}
