import type { SupabaseClient } from "@supabase/supabase-js";
import { demoCrmSnapshot } from "./demoData";
import type {
  CrmSnapshot,
  CustomerInput,
  CustomerRecord,
  Database,
  LeadInput,
  LeadRecord,
} from "./types";

type CrmClient = SupabaseClient<Database> | null;

let demoSnapshot: CrmSnapshot = structuredClone(demoCrmSnapshot);

function sortByUpdatedAt<T extends { updated_at: string }>(records: T[]) {
  return [...records].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function fetchCrmSnapshot(client: CrmClient): Promise<CrmSnapshot> {
  if (!client) {
    return structuredClone(demoSnapshot);
  }

  const [companies, leads, customers] = await Promise.all([
    client.from("companies").select("*").order("name", { ascending: true }),
    client.from("leads").select("*").order("updated_at", { ascending: false }),
    client.from("customers").select("*").order("updated_at", { ascending: false }),
  ]);

  if (companies.error) {
    throw companies.error;
  }

  if (leads.error) {
    throw leads.error;
  }

  if (customers.error) {
    throw customers.error;
  }

  return {
    companies: companies.data,
    leads: leads.data,
    customers: customers.data,
  };
}

export async function createLead(client: CrmClient, input: LeadInput) {
  if (!client) {
    const now = new Date().toISOString();
    const lead: LeadRecord = {
      id: makeId("lead"),
      company_id: input.company_id,
      customer_id: null,
      contact_name: input.contact_name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      property_address: input.property_address,
      city: input.city ?? null,
      state: input.state ?? "AZ",
      postal_code: input.postal_code ?? null,
      service_type: input.service_type,
      source: input.source ?? "Website",
      status: input.status ?? "new",
      priority: input.priority ?? "normal",
      estimated_value: input.estimated_value ?? 0,
      next_follow_up: input.next_follow_up ?? null,
      notes: input.notes ?? null,
      created_by: null,
      created_at: now,
      updated_at: now,
    };

    demoSnapshot = {
      ...demoSnapshot,
      leads: sortByUpdatedAt([lead, ...demoSnapshot.leads]),
    };

    return lead;
  }

  const { data, error } = await client.from("leads").insert(input).select("*").single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateLead(
  client: CrmClient,
  id: string,
  updates: Partial<LeadInput>,
) {
  if (!client) {
    const now = new Date().toISOString();
    let updatedLead: LeadRecord | null = null;

    demoSnapshot = {
      ...demoSnapshot,
      leads: sortByUpdatedAt(
        demoSnapshot.leads.map((lead) => {
          if (lead.id !== id) {
            return lead;
          }

          updatedLead = {
            ...lead,
            ...updates,
            phone: updates.phone === undefined ? lead.phone : updates.phone,
            email: updates.email === undefined ? lead.email : updates.email,
            city: updates.city === undefined ? lead.city : updates.city,
            postal_code:
              updates.postal_code === undefined ? lead.postal_code : updates.postal_code,
            next_follow_up:
              updates.next_follow_up === undefined
                ? lead.next_follow_up
                : updates.next_follow_up,
            notes: updates.notes === undefined ? lead.notes : updates.notes,
            updated_at: now,
          };

          return updatedLead;
        }),
      ),
    };

    if (!updatedLead) {
      throw new Error("Lead not found.");
    }

    return updatedLead;
  }

  const { data, error } = await client
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createCustomer(client: CrmClient, input: CustomerInput) {
  if (!client) {
    const now = new Date().toISOString();
    const customer: CustomerRecord = {
      id: makeId("customer"),
      company_id: input.company_id,
      display_name: input.display_name,
      contact_name: input.contact_name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      property_address: input.property_address,
      city: input.city ?? null,
      state: input.state ?? "AZ",
      postal_code: input.postal_code ?? null,
      customer_type: input.customer_type ?? "homeowner",
      status: input.status ?? "active",
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
    };

    demoSnapshot = {
      ...demoSnapshot,
      customers: sortByUpdatedAt([customer, ...demoSnapshot.customers]),
    };

    return customer;
  }

  const { data, error } = await client
    .from("customers")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateCustomer(
  client: CrmClient,
  id: string,
  updates: Partial<CustomerInput>,
) {
  if (!client) {
    const now = new Date().toISOString();
    let updatedCustomer: CustomerRecord | null = null;

    demoSnapshot = {
      ...demoSnapshot,
      customers: sortByUpdatedAt(
        demoSnapshot.customers.map((customer) => {
          if (customer.id !== id) {
            return customer;
          }

          updatedCustomer = {
            ...customer,
            ...updates,
            phone: updates.phone === undefined ? customer.phone : updates.phone,
            email: updates.email === undefined ? customer.email : updates.email,
            city: updates.city === undefined ? customer.city : updates.city,
            postal_code:
              updates.postal_code === undefined
                ? customer.postal_code
                : updates.postal_code,
            notes: updates.notes === undefined ? customer.notes : updates.notes,
            updated_at: now,
          };

          return updatedCustomer;
        }),
      ),
    };

    if (!updatedCustomer) {
      throw new Error("Customer not found.");
    }

    return updatedCustomer;
  }

  const { data, error } = await client
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function convertLeadToCustomer(client: CrmClient, lead: LeadRecord) {
  const customer = await createCustomer(client, {
    company_id: lead.company_id,
    display_name: lead.contact_name,
    contact_name: lead.contact_name,
    phone: lead.phone,
    email: lead.email,
    property_address: lead.property_address,
    city: lead.city,
    state: lead.state,
    postal_code: lead.postal_code,
    customer_type: "homeowner",
    status: "active",
    notes: lead.notes,
  });

  await updateLead(client, lead.id, {
    status: "won",
  });

  if (!client) {
    demoSnapshot = {
      ...demoSnapshot,
      leads: demoSnapshot.leads.map((item) =>
        item.id === lead.id ? { ...item, customer_id: customer.id } : item,
      ),
    };
  } else {
    const { error } = await client
      .from("leads")
      .update({ customer_id: customer.id })
      .eq("id", lead.id);

    if (error) {
      throw error;
    }
  }

  return customer;
}
