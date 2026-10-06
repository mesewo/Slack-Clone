package permission

// This matrix contains elevated operations currently represented as
// permissions. Ordinary member access, such as reading and posting, remains
// governed by the existing membership and channel checks.
var rolePermissions = map[string]map[Permission]struct{}{
	"OWNER": permissionSet(
		PermissionCreateChannel,
		PermissionDeleteMessage,
		PermissionRemoveMember,
		PermissionInviteMember,
		PermissionUpdateMemberRole,
	),
	"ADMIN": permissionSet(
		PermissionCreateChannel,
		PermissionDeleteMessage,
		PermissionRemoveMember,
		PermissionInviteMember,
		PermissionUpdateMemberRole,
	),
	"MEMBER": permissionSet(),
	// GUEST is limited to ordinary read and post-message access. Guests cannot
	// create channels, invite members or guests, remove members, change roles,
	// delete other users' messages, or perform other elevated operations.
	"GUEST": permissionSet(),
}

func permissionSet(permissions ...Permission) map[Permission]struct{} {
	set := make(map[Permission]struct{}, len(permissions))
	for _, permission := range permissions {
		set[permission] = struct{}{}
	}
	return set
}
