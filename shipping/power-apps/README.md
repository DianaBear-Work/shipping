# Vertiv Package Tracker — Power Apps + SharePoint

This folder contains an idempotent SharePoint list provisioner and a build
specification for a future Canvas app and Power Automate flows. It creates the
Microsoft 365 data structure and Williamston location categories; it does not
create package records, employee records, the app, or flows. Those resources
require an approved Vertiv Microsoft 365 environment and administrator access.

The sibling `package-tracker.html` page is a separate, temporary UI prototype.
Its records exist only in page memory and are discarded on reload. Do not enter
real package or employee information until production SharePoint storage,
authentication, and permissions are implemented and tested.

## Stage 1 — provision the SharePoint lists

Create or select a **private SharePoint team site** for the package operation.
Have the Microsoft 365 administrator register or approve an interactive PnP
PowerShell application for the tenant, grant it the minimum approved delegated
SharePoint permission needed to create lists and fields on this site, and
provide its application (client) ID and tenant ID. Do not put credentials or
client secrets in this repository.

On an approved workstation, install PnP PowerShell if needed, then run from the
shipping project folder:

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
.\power-apps\Provision-SharePointLists.ps1 `
  -SiteUrl "https://<tenant>.sharepoint.com/sites/<private-package-site>" `
  -TenantId "<tenant-id>" `
  -ClientId "<approved-application-id>"
```

The script uses interactive Microsoft sign-in, is safe to rerun for lists and
fields it has already created, and seeds only the ten Williamston location
categories. It does not create dummy packages or employees. Review the site and
list permissions before adding any real package data. Existing columns are
preserved; rerunning the script does not reconcile or delete manually changed
fields.

### Lists and key columns

| List | Purpose | Important columns |
|---|---|---|
| `PackageTracking` | Current package record | `PackageID` (unique), `Carrier`, `TrackingNumber`, `RecipientName`, `RecipientEmail`, `Department`, `Facility`, `DateReceived`, `ReceivedBy`, `Description`, `Quantity`, `Notes`, `CurrentLocation`, `LocationDetails`, `Status`, `ExpectedDeliveryDate`, `ReceivedAt`, `PickedUpBy`, `PickedUpAt` |
| `PackageLocationHistory` | Append-only location events | unique `ActionID`, `PackageID`, `PreviousLocation`, `NewLocation`, old/new location details, `Employee`, `ChangedAt`, `Notes` |
| `PackageStatusHistory` | Registration, receipt, status, pickup, delivery, return, and exception events | unique `ActionID`, `PackageID`, `Action`, `PreviousStatus`, `NewStatus`, `Employee`, `ChangedAt`, `Notes` |
| `ShippingLocations` | Facility-specific location catalogue | `Title`, `Facility`, `Category`, `StorageArea`, `Shelf`, `Row`, `Room`, `Desk`, `Directions`, `IsActive` |
| `PackageNotifications` | Notification audit and delivery outcome | unique `NotificationKey`, `PackageID`, `RecipientEmail`, `NotificationType`, `SentAt`, `SendStatus`, `FlowRunId`, `Details` |

`PackageID` is a unique text key shared by the package and history lists. The
app should generate it before registration, for example
`WIL-PKG-` + the full, hyphen-free `GUID()` value. Keep the facility prefix
configurable for future sites. The SharePoint item `ID` is not the package ID.
The location catalogue is seeded with Shipping & Receiving, Warehouse, IT
Department, HR Office, Front Office, Maintenance, Quality, Production, Other,
and Unknown / Needs Sorting. Add actual shelves, rows, desks, rooms, and
directions as managed `ShippingLocations` records; do not make those into
uncontrolled free-text categories.

## Security before building the app

Create Entra ID / Microsoft 365 groups for package administrators and
Shipping & Receiving. Add only approved employees to those groups. Keep the
SharePoint site private and do not grant broad visitor access. Give app users
only the list-level **Read** permission needed for app queries; give the
approved flow/service identity the list write permission. Do not give ordinary
employees or Shipping & Receiving direct list Edit rights. Administrators
perform full management through the role-checked app flows; keep site-owner
access limited to the small recovery/administration group.

SharePoint list permissions are the security boundary; hiding records in a
Power Apps gallery is not access control. In particular:

- Employees must only be able to read package items and history items shared
  with them. Use item-level sharing from the registration/action flows to grant
  the recipient, Shipping & Receiving, and administrator groups **Read** access
  to each applicable item. Give Shipping & Receiving/admins all-item access
  through the app and validated flows, not a direct list-wide write grant.
- Employees must not have direct edit rights to package or history lists.
  Route create, location, status, and pickup writes through secured flows using
  an approved service connection. In each flow, identify the caller using that
  caller's authenticated Microsoft 365 connection and validate their role
  before acting; never trust an email address supplied by a Power Apps input.
- Grant recipients read-only access to their own history items. Restrict
  `PackageNotifications` to administrators and the flow/service account.
- The list schema does not make history immutable by itself. Only the flow
  service account and designated administrators should be able to write history
  lists. If tamper-proof retention is required, ask the tenant administrator
  about Microsoft Purview retention/records licensing and policy.
- Item-level sharing creates unique permission scopes. Have the SharePoint
  administrator monitor list size and permission-scope growth, and define an
  approved retention/archive plan before expanding to additional facilities or
  high package volumes. Keep each facility's recipient and operations access
  scoped to its own records.

Test permissions with a normal employee, a recipient, a Shipping & Receiving
user, and an administrator. Verify both the app and direct SharePoint list
URLs; a user must not be able to enumerate another employee's packages by
opening a list directly.

## Stage 2 — build the Canvas app

In Power Apps, create a **Canvas app from blank** in the approved environment,
add the five SharePoint lists as data sources, and add the flows below as
connections. Turn off **Scale to fit** and **Lock aspect ratio**; use responsive
containers so cards wrap on narrow screens. Apply the Vertiv palette:
`#FE5B1B` accent, black navigation/header, white surfaces, dark text, visible
focus states, and large touch targets (at least 48 px) for scan and pickup
actions.

Create these screens:

1. **Home** — role-appropriate KPI cards, recent activity, search, and large
   Scan, Add Package, Find Package, and Package Management actions. For
   employee view, show only their own packages. For Shipping & Receiving,
   show facility metrics and queue filters.
2. **Register Package** — carrier, tracking number, recipient, department,
   facility, received date/person, description, quantity, notes, status, and a
   required physical location for a package already received. A separate
   Barcode reader can fill the carrier tracking number where its label format
   is supported; retain manual entry and correction. A not-yet-arrived package
   can be `Expected`; on receipt, require a location, including
   `Unknown / Needs Sorting` if necessary.
3. **Scan** — use the Power Apps **Barcode reader** control on mobile. Its
   `Barcodes` table provides the scanned `Value`; look up `PackageTracking` by
   exact `PackageID`, then open Package Detail. Show a clear not-found error;
   never treat a scan as a successful update until the relevant flow returns
   success.
4. **Package Detail** — show package ID, recipient, status, and current physical
   location prominently. Provide authorized Move, Status, and Pick Up actions,
   with notes and confirmation. A move requires a new catalogue location and
   writes a location-history item; pickup records the authenticated employee
   and time and changes status to `Picked Up`.
5. **Find Package** — search by package ID, carrier tracking number, recipient,
   recipient email, department, or current location. Use indexed SharePoint
   columns and delegable filters where possible. Do not retrieve all packages
   and filter them only on the device.
6. **Package Management** — Shipping & Receiving/admin only. Filter by status,
   location, missing location, facility, and overdue pickup; open history and
   edit package details through secured flows. Build export only after
   confirming the tenant-approved reporting destination and data access.

Use the authenticated identity (`User().Email`) for display and routing only;
the flows must establish and validate the caller identity themselves. Generate
the package key in the app before registration, e.g.
`"WIL-PKG-" & Upper(Substitute(Text(GUID()), "-", ""))`; the unique SharePoint
column rejects accidental duplicates.

### QR codes and carrier barcodes

The Canvas Barcode reader can scan QR codes and supported carrier barcodes in
the Power Apps mobile client; camera permission and a supported mobile device
are required. The reader does not, by itself, create a printable QR image.
Before printing labels, select an organization-approved QR generation/label
solution and encode only the opaque `PackageID` (or an authenticated app link),
not recipient names, email addresses, or tracking data. A third-party QR
connector may require a premium Power Automate license and security approval;
do not send package data to a public QR-generation website.

## Stage 3 — Power Automate flows

Create and test these flows in the same approved Power Platform environment.
Use the SharePoint connector and Microsoft 365 email/profile connectors under
approved connections. Share Power Apps-triggered flows with the intended
run-only users; configure the SharePoint write connection as the approved
service identity, and obtain caller identity through the caller's own
authenticated Microsoft 365 connection.

### `RegisterPackage` — Power Apps (V2)

1. Validate required fields, including a physical location when the item is
   received, a valid recipient email, positive quantity, and an allowed
   status/location.
2. Create the `PackageTracking` item with `Title` and the generated unique
   `PackageID`, plus all submitted fields. On receipt, set `ReceivedAt`, `DateReceived`, and
   `ReceivedBy` from the authenticated caller, not from untrusted app input.
3. Add a `PackageStatusHistory` event (`Package Registered`, and
   `Package Received` when applicable) and an initial
   `PackageLocationHistory` event when a physical location is assigned.
   Generate a unique `ActionID` for every history row.
4. Grant item-level read to the recipient and the approved operations groups.
   Keep package and history list writes unavailable to ordinary app users.
5. If received, send the recipient an email with package ID, carrier, current
   physical location, and pickup instructions. Write a `PackageNotifications`
   row for every send attempt, including outcome and flow run ID. Use a
   deterministic unique `NotificationKey` (package ID + notification type +
   reminder period/event) and create a `Pending` row before sending; update it
   to `Sent` or `Failed` afterward.
6. Return the package ID and created item ID to the app only after all required
   writes succeed. Surface flow failures in the app and provide a safe retry
   path that does not create duplicates.

### `UpdatePackage` — Power Apps (V2)

1. Resolve the caller from their authenticated Microsoft 365 connection, load
   the current item, and authorize the action: location/status management is
   Shipping & Receiving/admin only; pickup is allowed to the recipient or
   authorized staff. Accept an `ActionID` generated by the app and reuse it
   when retrying the same action.
2. For a move, require an active new location; update the package's current
   location and append `PackageLocationHistory` with old/new location,
   authenticated employee, server timestamp, and notes. For a status change or
   pickup, update the current record and append `PackageStatusHistory` with
   old/new status and authenticated employee/time. Set `PickedUpBy` and
   `PickedUpAt` on pickup. Never edit or remove prior history rows.
3. SharePoint cannot commit changes atomically across lists. On retries, check
   the unique `ActionID` and verify the current record before returning success;
   if only one write completed, finish the missing write or alert Shipping &
   Receiving for reconciliation. Return an explicit failure rather than
   success-shaped fallback. Apply the same item-level sharing rules to new
   history items.
4. For notifications, create a unique-key `Pending` audit row before sending,
   then update its outcome. On retry, inspect that row rather than sending a
   duplicate message.
5. Notify the appropriate recipient for configured location/status changes and
   record the send result in `PackageNotifications`.

### `NotifyOverduePickups` — scheduled

Run on an approved daily schedule. Make the unclaimed period a documented
flow setting (for example, `OverdueDays`) so operations can change it without
editing app screens. Find received packages older than that period whose
status is not `Picked Up`, `Returned`, or `Delivered`; notify the recipient and
Shipping & Receiving. Check `PackageNotifications` before sending to prevent
duplicate reminders, and record each outcome.

### `GetPackageDashboard` — Power Apps (V2), recommended

Return aggregate counts for the caller's authorized scope: incoming, received
today, awaiting pickup, in storage, delivered, unknown location, and attention
required. Restrict facility-wide counts to the operations/admin groups; an
employee receives only their own counts. Configure SharePoint Get items
pagination and explicit facility/status filters so counts are not silently
truncated by Power Apps' non-delegable row limit. Use the facility's local
time zone when counting today's receipts. Keep the definitions consistent:
incoming = `Expected` or active in-process packages; received today =
`ReceivedAt` on the current local date; awaiting pickup = `Ready for Pickup`;
in storage = `Stored`; delivered = `Delivered`; unknown location =
`CurrentLocation` in the `Unknown / Needs Sorting` category; attention =
`Exception`, `Needs Sorting`, or a received package with no current location.

## Licensing and tenant dependencies

- SharePoint Online, Power Apps, and Power Automate must be available in the
  Vertiv tenant; app creation/sharing, Power Platform environment policy, and
  email connector use require tenant approval.
- SharePoint and Microsoft 365 Outlook/Users connectors are commonly standard
  connectors, but the applicable Vertiv licenses and DLP policies determine
  actual availability. Confirm with the Power Platform administrator.
- A QR **scanner** is a built-in Power Apps mobile capability. QR **image
  generation/label printing** is a separate capability; approved connectors,
  print infrastructure, and potentially premium licensing may be needed.
- Provisioning requires PnP PowerShell and an approved tenant app registration
  with delegated site-management permission. It was not run from this
  repository because no Vertiv SharePoint URL, tenant/application IDs, or
  administrator approval were supplied.

## Acceptance test

Before release, verify: register a received package with a physical location;
confirm its generated ID is unique; scan its QR label on a phone; view current
location/status; move it and verify an immutable old/new location event; search
for it as its recipient; mark it picked up and verify authenticated employee,
timestamp, status history, and notification/audit record; test overdue
reminders and duplicate prevention; and confirm each role cannot open other
employees' package/history items directly in SharePoint.
