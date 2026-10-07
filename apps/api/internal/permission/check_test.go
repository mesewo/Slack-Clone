package permission

import "testing"

func TestCheck(t *testing.T) {
	permissions := []Permission{
		PermissionCreateChannel,
		PermissionDeleteMessage,
		PermissionRemoveMember,
		PermissionInviteMember,
		PermissionUpdateMemberRole,
		PermissionManageWebhooks,
	}
	tests := []struct {
		role       string
		permission Permission
		want       bool
	}{
		{role: "OWNER", permission: PermissionCreateChannel, want: true},
		{role: "OWNER", permission: PermissionDeleteMessage, want: true},
		{role: "OWNER", permission: PermissionRemoveMember, want: true},
		{role: "OWNER", permission: PermissionInviteMember, want: true},
		{role: "OWNER", permission: PermissionUpdateMemberRole, want: true},
		{role: "OWNER", permission: PermissionManageWebhooks, want: true},
		{role: "ADMIN", permission: PermissionCreateChannel, want: true},
		{role: "ADMIN", permission: PermissionDeleteMessage, want: true},
		{role: "ADMIN", permission: PermissionRemoveMember, want: true},
		{role: "ADMIN", permission: PermissionInviteMember, want: true},
		{role: "ADMIN", permission: PermissionUpdateMemberRole, want: true},
		{role: "ADMIN", permission: PermissionManageWebhooks, want: true},
		{role: "MEMBER", permission: PermissionCreateChannel, want: false},
		{role: "MEMBER", permission: PermissionDeleteMessage, want: false},
		{role: "MEMBER", permission: PermissionRemoveMember, want: false},
		{role: "MEMBER", permission: PermissionInviteMember, want: false},
		{role: "MEMBER", permission: PermissionUpdateMemberRole, want: false},
		{role: "MEMBER", permission: PermissionManageWebhooks, want: false},
		{role: "GUEST", permission: PermissionCreateChannel, want: false},
		{role: "GUEST", permission: PermissionDeleteMessage, want: false},
		{role: "GUEST", permission: PermissionRemoveMember, want: false},
		{role: "GUEST", permission: PermissionInviteMember, want: false},
		{role: "GUEST", permission: PermissionUpdateMemberRole, want: false},
		{role: "GUEST", permission: PermissionManageWebhooks, want: false},
	}

	if want := len(rolePermissions) * len(permissions); len(tests) != want {
		t.Fatalf("test matrix has %d cases, want %d role-permission pairs", len(tests), want)
	}
	for _, test := range tests {
		t.Run(test.role+"/"+string(test.permission), func(t *testing.T) {
			if got := Check(test.role, test.permission); got != test.want {
				t.Errorf("Check(%q, %q) = %t, want %t", test.role, test.permission, got, test.want)
			}
		})
	}
	if Check("UNKNOWN", PermissionCreateChannel) {
		t.Error("Check accepted an unknown role")
	}
}
