package permission

type Permission string

const (
	PermissionCreateChannel    Permission = "create_channel"
	PermissionDeleteMessage    Permission = "delete_message"
	PermissionRemoveMember     Permission = "remove_member"
	PermissionInviteMember     Permission = "invite_member"
	PermissionUpdateMemberRole Permission = "update_member_role"
	PermissionManageWebhooks   Permission = "manage_webhooks"
)
