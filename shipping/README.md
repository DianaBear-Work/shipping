# Vertiv Package Tracker

This is the standalone Package Tracker project. It is separate from the
Williamston IT support website.

## Open the prototype

Open `package-tracker.html` directly in a modern browser. It includes a
dashboard and interactive session-only workflows for registering, searching,
scanning/looking up, moving, updating the status of, and marking packages as
picked up.

## Public demo website

Once GitHub Pages is enabled and the first deployment succeeds, the demo will
be available at https://dianabear-work.github.io/shipping/. The source
repository and website are public. Do not enter real package, carrier, or
employee information. Updates to `main` deploy automatically through the
GitHub Actions workflow.

**Prototype warning:** do not enter real package, carrier, or employee
information. Records exist only in the current page memory and disappear when
you reload. The page has no Microsoft sign-in, SharePoint connection, durable
storage, notifications, or access control. The `noindex` setting is not a
security boundary.

Camera scanning requires a secure HTTPS origin, camera permission, and a
browser that supports `BarcodeDetector`. If unavailable, enter a package ID or
use a handheld scanner. QR label/image generation is not included.

## Project files

- `package-tracker.html` — standalone application page.
- `css/package-tracker.css` — responsive Vertiv-themed interface.
- `js/package-tracker.js` — interactive prototype behavior.
- `images/vertivWhiteLogo.jpg` — logo asset used by this project.
- `power-apps/` — SharePoint list provisioner and Microsoft 365 build guide.

## Next step for real operations

Follow `power-apps/README.md` with a Vertiv Microsoft 365 administrator.
SharePoint must become the private system of record, with approved Microsoft
sign-in, role-based permissions, and secured Power Automate flows. Complete the
guide's role-access and end-to-end acceptance tests before using real
deliveries. No Microsoft 365 tenant resources have been deployed by this
prototype.
