"use client";

import { useState } from "react";

export default function NewLeadPanel() {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
  };

  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm">
      <h2 className="mb-6 text-2xl font-bold text-slate-950">New Lead</h2>

      {saved && (
        <div className="mb-4 rounded-xl bg-green-100 p-3 text-sm font-semibold text-green-800">
          Lead saved successfully!
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <input className="rounded-xl border p-3" placeholder="Customer Name" />
        <input className="rounded-xl border p-3" placeholder="Phone Number" />
        <input className="rounded-xl border p-3" placeholder="Email Address" />
        <input className="rounded-xl border p-3" placeholder="Property Address" />

        <select className="rounded-xl border p-3">
          <option>Lead Source</option>
          <option>Google</option>
          <option>Referral</option>
          <option>BNI</option>
          <option>Facebook</option>
          <option>Yelp</option>
          <option>Door Knocking</option>
        </select>

        <select className="rounded-xl border p-3">
          <option>Service Needed</option>
          <option>Roofing</option>
          <option>Painting</option>
          <option>Both</option>
        </select>
      </div>

      <textarea
        className="mt-4 h-32 w-full rounded-xl border p-3"
        placeholder="Notes..."
      />

      <button
        type="button"
        onClick={handleSave}
        className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
      >
        Save Lead
      </button>
    </div>
  );
}