"use client";

import PageContainer from "@/components/layout/page-container";

export default function TeamPage() {
  return (
    <PageContainer
      pageTitle="Team Management"
      pageDescription="Manage workspace members and roles"
    >
      <p className="text-muted-foreground">
        Team management will use the local workspace membership APIs.
      </p>
    </PageContainer>
  );
}
