# WeatherTech OS Pilot Stabilization Test Checklist

Use this checklist before a real pilot session. Test local demo mode first, then repeat the live items while signed in with a Supabase user.

## Mode And Auth

- Local demo mode loads when there is no active Supabase session and demo fallback is not disabled.
- Local demo mode shows the demo data notice and does not show the live data error screen.
- Signed-in Supabase mode loads live CRM records and does not silently fall back to demo data after a live load failure.
- Signing out returns to the demo workspace when demo fallback is enabled.
- Signing out returns to the auth screen when `NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK=true`.

## Customers

- Create a customer and confirm one success toast appears.
- Confirm the create button is disabled while the save is in progress.
- Refresh the page and confirm the customer remains visible.
- Edit the customer contact details, type, status, notes, and property address.
- Refresh again and confirm the edits persist.
- In local demo mode, confirm creating or editing a demo customer does not attempt a Supabase write.

## Leads

- Create a lead and confirm one success toast appears.
- Refresh the page and confirm the lead remains visible.
- Edit the lead status, pipeline stage, priority, value, follow-up date, and notes.
- Change the lead status from the pipeline controls and confirm it persists after refresh.
- Convert a lead to a customer and confirm the new customer appears once.
- In local demo mode, confirm creating, editing, status changes, and conversion persist locally.

## Jobs

- Create or select a job connected to a customer/property.
- Edit the job title, status, assigned crew, priority, dates, and notes.
- Change the job status from the job detail controls and confirm the success message matches the selected status.
- Refresh the page and confirm the job edits and status persist.
- In local demo mode, confirm job edits do not attempt Supabase writes for demo job IDs.

## Job Schedules

- Add a schedule from the job detail panel.
- Confirm the schedule appears immediately on the selected job.
- Confirm the success toast says `Job scheduled.`
- Confirm the form clears only after a successful save.
- Confirm no red error toast appears.
- Confirm the action does not show `Job moved to In progress.`
- Refresh the page and confirm the schedule remains.
- Move or edit the schedule in the calendar and confirm the update persists after refresh.

## Job Notes

- Add a job note from the selected job detail panel.
- Confirm the note appears immediately.
- Confirm the form clears only after a successful save.
- Refresh the page and confirm the note remains.
- Force a validation failure with an empty note and confirm a useful error appears.

## Production Checklist

- Add a checklist task from the selected job detail panel.
- Confirm the task appears immediately and the field clears.
- Mark the task `todo`, `in_progress`, and `done`.
- Edit the task title or notes, then save.
- Delete a task after confirming the delete action.
- Refresh the page and confirm the final task list and statuses remain.

## Materials

- Add a material with name, quantity, unit, and notes.
- Confirm the material appears immediately and the form clears.
- Refresh the page and confirm the material remains.
- Try an empty material name and confirm a useful validation error appears.

## Estimates And Scopes

- Create an estimate with customer/property association and line items.
- Confirm labor, materials, tax, discount, and profit margin totals calculate correctly.
- Save the estimate as a draft and confirm it remains after refresh.
- Edit the estimate and confirm updated totals persist.
- Generate a Scope of Work from the estimate and confirm it appears in scopes.
- Create or update a scope from the Scope Generator and confirm it remains after refresh.
- In local demo mode, confirm estimate and scope drafts persist locally.
- In local demo mode, confirm PDF packet, template save, and signature request actions show preview-only messages instead of attempting Supabase writes.

## Page Refresh Persistence

- In local demo mode, create or edit at least one customer, lead, job schedule, note, checklist task, material, estimate, and scope.
- Refresh the browser and confirm all local demo changes remain.
- In signed-in Supabase mode, repeat the same workflow and confirm all records reload from Supabase.

## Error Handling

- Confirm each save button shows either a success toast or a useful error message.
- Confirm duplicate rapid clicks do not create duplicate records.
- Confirm any Supabase error message shown to the user does not include secret keys or private environment values.
- Confirm the live data error screen appears only when signed-in live CRM loading fails and there is no valid live snapshot to render.
