# Library lending view

A responsive React demo for checking book availability, joining or cancelling a hold queue, and seeing overdue reminders.

## Run and test

```powershell
npm install
npm test
npm run build
npm run dev
```

The development server prints its local URL. The catalog is a small in-memory
fixture in `src/libraryData.js`; holds change the local view only and do not
persist across refreshes.

## Components and state ownership

- `App` owns the catalog request status, catalog data, error message, and retry
  counter. It applies hold changes to the shared catalog so the queue count and
  button state stay in sync.
- `BookList` owns only its temporary search text; it receives books and hold
  actions through props.
- `BookCard` renders an individual book and delegates hold actions to `App`.
- `AvailabilityBadge` presents copy availability.
- `OverdueReminder` derives reminders from loan due dates; it does not duplicate
  that state.

The catalog request has explicit loading, success/empty, and error states. An
empty search result is distinct from a genuinely empty catalog. If the catalog
load rejects (for example, because the service is unreachable), the view shows
an error alert and a retry action rather than hiding the failure.

## Assumptions

- This is a member-facing view with one current member; a hold belongs to that
  member when `userHasHold` is true.
- A book can be held only when `availableCopies` is zero. Copy counts, hold
  counts, and due dates are supplied by the catalog fixture and are not
  authoritative server data.
- Due dates are date-only strings in the library's local calendar. The overdue
  reminder compares them with the browser's current date.
- This exercise does not send real reminders, reserve inventory, or persist
  hold changes.

## Failure case and verification

Failure case: when catalog loading rejects (such as a network outage), the
catalog is not rendered as if it were empty. The page shows an accessible error
alert; **Try again** starts another request. A test forces the first request to
reject and verifies that retry loads the fixture.

`npm test` covers the loading-to-loaded transition, availability and overdue
reminder rendering, empty catalog, failed load/retry, and placing/cancelling a
hold with the corresponding queue-count updates. `npm run build` checks that
Vite can compile the production React bundle.
