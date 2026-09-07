"use client";

import PageContainer from "@/components/layout/page-container";

export default function BillingPage() {
  return (
    <PageContainer
      pageTitle="Billing & Plans"
      pageDescription="Manage subscription and usage limits"
    >
      <p className="text-muted-foreground">
        Billing integration is not configured for local development.
      </p>
    </PageContainer>
  );
}
