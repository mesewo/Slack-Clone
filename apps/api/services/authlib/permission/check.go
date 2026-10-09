package permission

func Check(role string, permission Permission) bool {
	permissions, ok := rolePermissions[role]
	if !ok {
		return false
	}
	_, ok = permissions[permission]
	return ok
}
