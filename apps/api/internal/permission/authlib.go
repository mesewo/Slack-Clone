package permission

import shared "github.com/mesewo/slack-clone/services/authlib/permission"

type Permission = shared.Permission

const (
	PermissionCreateChannel    = shared.PermissionCreateChannel
	PermissionDeleteMessage    = shared.PermissionDeleteMessage
	PermissionRemoveMember     = shared.PermissionRemoveMember
	PermissionInviteMember     = shared.PermissionInviteMember
	PermissionUpdateMemberRole = shared.PermissionUpdateMemberRole
	PermissionManageWebhooks   = shared.PermissionManageWebhooks
)

func Check(role string, permission Permission) bool {
	return shared.Check(role, permission)
}
