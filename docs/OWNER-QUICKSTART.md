# Owner Quickstart

## Scheduling A Job

1. Open **Jobs / Projects**.
2. Select the job you want to schedule.
3. In **Schedule production**, enter the title, schedule type, status, start time, end time, location, and any notes.
4. Click **Add schedule**.

When the schedule saves successfully, WeatherTech OS shows `Job scheduled.` and clears the schedule form.

If the workspace is using local demo CRM data, the schedule is saved to the local demo snapshot and appears immediately without calling Supabase.

If you are signed in with Supabase, the schedule is saved to Supabase and should remain after refreshing the page.

If the save fails, the form values stay in place and the red toast shows the underlying error so the issue can be corrected.
