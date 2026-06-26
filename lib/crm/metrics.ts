import type { CrmSnapshot, DashboardMetrics } from "./types";

const openLeadStatuses = new Set(["new", "contacted", "qualified", "estimate_sent"]);

export function calculateDashboardMetrics(snapshot: CrmSnapshot): DashboardMetrics {
  const openLeads = snapshot.leads.filter((lead) => openLeadStatuses.has(lead.status));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    openLeads: openLeads.length,
    newLeads: snapshot.leads.filter((lead) => lead.status === "new").length,
    qualifiedLeads: snapshot.leads.filter((lead) => lead.status === "qualified").length,
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
    pipelineValue: openLeads.reduce((total, lead) => total + lead.estimated_value, 0),
    wonValue: snapshot.leads
      .filter((lead) => lead.status === "won")
      .reduce((total, lead) => total + lead.estimated_value, 0),
  };
}
