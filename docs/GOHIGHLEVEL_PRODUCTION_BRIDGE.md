# GoHighLevel production bridge

WeatherTech OS remains the operational system of record. HighLevel supplies
company-scoped provider observations and communication history. The bridge's
approved OAuth scopes are read-only; customer messaging, campaigns, calls, and
automatic replies are not enabled by this integration.

## Verified account mapping

The HighLevel agency **WeatherTech roofing** contains two subaccounts, verified
in the agency account list and Marketplace active installations on September 4,
2026 (America/Phoenix):

| WTOS company | HighLevel subaccount | Location ID |
| --- | --- | --- |
| WeatherTech Roofing LLC | WeatherTech roofing | `RXYjJp6vZhx7lThryAfj` |
| IHC Painting | IHC Painting | `F7wwUt8KaFbkGHsdmCVf` |

IHC is an existing subaccount within the WeatherTech agency, not a separate
agency account. Both connections use encrypted server-side credentials and
separate company/location bindings.

## Marketplace webhook configuration

The private **Weather-Tech OS** app sends these enabled events to
`https://weathertech-os.vercel.app/api/integrations/gohighlevel/webhook`:

- `AppointmentCreate`
- `AppointmentUpdate`
- `ContactCreate`
- `OpportunityCreate`
- `InboundMessage`
- `OutboundMessage`

`OutboundMessage` observes communication already sent by the provider. It does
not send a message. Signatures and exact location bindings are checked before
ingestion. A saved subscription is configuration evidence, not proof of a
successful signed delivery; Integration Center reports the actual receipt state.

Other subscriptions remain off. Contact/opportunity update payloads need a
reliable mutable version or authenticated hydration; the current stale-version
guard preserves newer snapshots. DND/tag/assignment/unread events contain fields
the current normalization does not preserve. Conversation merge and deletion
events require explicit merge/tombstone handling. Use bounded read-only sync for
supported current-resource refreshes; it does not infer deletions from absence.
Messages lacking a stable provider identity remain unresolved for reconciliation.

## Phone limitations

At verification, WeatherTech's HighLevel Phone System displayed “Your phone
system requires configuration” and directed the owner to support. IHC's Phone
Numbers inventory displayed “No Data.” Neither observation proves carrier SMS
reception. No numbers were purchased, ported, or released, and existing
Twilio/carrier routing was not changed.

## Operational verification

In WTOS, select one company, open **Integrations**, and select **Check sync
readiness**. Verify the exact location, last successful sync, resource counts,
conflicts, webhook receipts, and retry state. Repeat for the other company.
Historical failed attempts remain in the audit trail; only demonstrated recovery
or superseded initial setup should stop contributing to current health alerts.
Never create customer communications solely to make webhook health appear green.
