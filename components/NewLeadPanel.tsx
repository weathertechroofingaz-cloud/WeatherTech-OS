"use client";

import type { FormEvent } from "react";
import { useState } from "react";

export default function NewLeadPanel() {
  const [savedMessage, setSavedMessage] = useState("");

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const customerName = String(formData.get("customerName") || "Lead").trim();

    setSavedMessage(`${customerName || "Lead"} draft captured.`);
    event.currentTarget.reset();
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-2xl font-bold text-slate-950">New Lead</h2>

      {savedMessage ? (
        <div className="mb-4 rounded-md bg-emerald-100 p-3 text-sm font-semibold text-emerald-800">
          {savedMessage}
        </div>
      ) : null}

      <form onSubmit={handleSave}>
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            className="rounded-md border border-slate-300 p-3"
            name="customerName"
            placeholder="Customer Name"
            required
          />
          <input
            className="rounded-md border border-slate-300 p-3"
            name="phone"
            placeholder="Phone Number"
          />
          <input
            className="rounded-md border border-slate-300 p-3"
            name="email"
            placeholder="Email Address"
          />
          <input
            className="rounded-md border border-slate-300 p-3"
            name="propertyAddress"
            placeholder="Property Address"
          />

          <select
            className="rounded-md border border-slate-300 p-3"
            name="source"
            defaultValue=""
          >
            <option value="" disabled>
              Lead Source
            </option>
            <option>Google</option>
            <option>Referral</option>
            <option>BNI</option>
            <option>Facebook</option>
            <option>Yelp</option>
            <option>Door Knocking</option>
          </select>

          <select
            className="rounded-md border border-slate-300 p-3"
            name="service"
            defaultValue=""
          >
            <option value="" disabled>
              Service Needed
            </option>
            <option>Roofing</option>
            <option>Painting</option>
            <option>Both</option>
          </select>
        </div>

        <textarea
          className="mt-4 h-32 w-full rounded-md border border-slate-300 p-3"
          name="notes"
          placeholder="Notes..."
        />

        <button
          type="submit"
          className="mt-6 rounded-md bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
        >
          Save Lead
        </button>
      </form>
    </section>
  );
}
