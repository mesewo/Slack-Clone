package auth

import (
	"net/http"
	"time"
)

const CookieName = "token"

// CookieConfig.Secure should be true whenever the app is served over HTTPS
// (i.e. in production). Drive it from an env var, not a hardcoded bool.
type CookieConfig struct {
	Secure bool
}

func (c CookieConfig) Set(w http.ResponseWriter, token string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   c.Secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(ttl.Seconds()),
	})
}

// Clear expires the cookie immediately - this is what Logout calls.
func (c CookieConfig) Clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   c.Secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}