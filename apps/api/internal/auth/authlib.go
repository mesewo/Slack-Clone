package auth

import shared "github.com/mesewo/slack-clone/services/authlib/auth"

// These aliases keep the existing Core call sites stable while the
// implementations live in the shared, stateless auth library.
type Claims = shared.Claims
type TokenManager = shared.TokenManager

var NewTokenManager = shared.NewTokenManager
var HashPassword = shared.HashPassword
var CheckPasswordHash = shared.CheckPasswordHash
