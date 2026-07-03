import type { CrmSnapshot, DashboardMetrics } from "./types";

const openLeadStatuses = new Set([
  "new",
  "contacted",
  "qualified",
  "estimate_sent",
  "New Lead",
  "Contacted",
  "Estimate Scheduled",
  "Proposal Sent",
]);
const activeJobStatuses = new Set(["scheduled", "in_progress", "blocked"]);
const openInvoiceStatuses = new Set(["draft", "sent", "overdue"]);
const pendingOrderStatuses = new Set(["draft", "ordered", "partial"]);

export function calculateDashboardMetrics(snapshot: CrmSnapshot): DashboardMetrics {
  const openLeads = snapshot.leads.filter((lead) => openLeadStatuses.has(lead.status));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const closedLeads = snapshot.leads.filter(
    (lead) =>
      lead.status === "won" ||
      lead.status === "Won" ||
      lead.status === "lost" ||
      lead.status === "Lost",
  );
  const completedJobs = snapshot.jobs.filter(
    (job) => job.status === "completed" || job.status === "closed",
  );
  const approvedEstimateValue = snapshot.estimates
    .filter((estimate) => estimate.status === "approved")
    .reduce((total, estimate) => total + estimate.total, 0);
  const materialSpend = snapshot.materialOrders.reduce(
    (total, order) => total + order.total,
    0,
  );

  return {
    openLeads: openLeads.length,
    newLeads: snapshot.leads.filter(
      (lead) => lead.status === "new" || lead.status === "New Lead",
    ).length,
    qualifiedLeads: snapshot.leads.filter(
      (lead) =>
        lead.status === "qualified" || lead.status === "Estimate Scheduled",
    ).length,
    customers: snapshot.customers.length,
    urgentFollowUps: openLeads.filter((lead) => {
      if (lead.priority === "urgent") {
        return true;
      }

      if (!lead.next_follow_up) {
        return false;
      }

      const followUpDate = new Date(`${lead.next_follow_up}T00:00:00`);
      return followUpDate <= today;
    }).length,
    pipelineValue: openLeads.reduce(
      (total, lead) => total + (lead.estimate_amount ?? lead.estimated_value),
      0,
    ),
    wonValue: snapshot.leads
      .filter((lead) => lead.status === "won" || lead.status === "Won")
      .reduce(
        (total, lead) => total + (lead.estimate_amount ?? lead.estimated_value),
        0,
      ),
    openEstimates: snapshot.estimates.filter(
      (estimate) => estimate.status === "draft" || estimate.status === "sent",
    ).length,
    estimateValue: snapshot.estimates
      .filter((estimate) => estimate.status !== "rejected" && estimate.status !== "expired")
      .reduce((total, estimate) => total + estimate.total, 0),
    scopesReady: snapshot.scopes.filter((scope) => scope.status === "ready").length,
    activeJobs: snapshot.jobs.filter((job) => activeJobStatuses.has(job.status)).length,
    scheduledEvents: snapshot.scheduleEvents.filter(
      (event) => event.status === "scheduled",
    ).length,
    unpaidInvoices: snapshot.invoices
      .filter((invoice) => openInvoiceStatuses.has(invoice.status))
      .reduce((total, invoice) => total + invoice.balance_due, 0),
    materialOrdersPending: snapshot.materialOrders.filter((order) =>
      pendingOrderStatuses.has(order.status),
    ).length,
    revenueCollected: snapshot.payments
      .filter((payment) => payment.status === "posted")
      .reduce((total, payment) => total + payment.amount, 0),
    closeRate: closedLeads.length
      ? Math.round(
          (snapshot.leads.filter(
            (lead) => lead.status === "won" || lead.status === "Won",
          ).length /
            closedLeads.length) *
            100,
        )
      : 0,
    grossProfit: approvedEstimateValue - materialSpend,
    productionCompletion: snapshot.jobs.length
      ? Math.round((completedJobs.length / snapshot.jobs.length) * 100)
      : 0,
    pendingChangeOrders: snapshot.changeOrders.filter(
      (changeOrder) =>
        changeOrder.status === "draft" || changeOrder.status === "sent",
    ).length,
    unreadNotifications: snapshot.notifications.filter(
      (notification) =>
        notification.status === "queued" || notification.status === "sent",
    ).length,
  };
}
