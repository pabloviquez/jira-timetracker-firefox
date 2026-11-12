# Privacy policy: Jira Time Tracker for uHub (Firefox)

Last updated: 2026-11-11

Jira Time Tracker for uHub is a Firefox extension that times the Jira ticket you are working on and logs that time to the ticket's worklog on `https://jira.uhub.biz`.

## Summary

- The developer collects no data from you. The extension has no server of its own, no analytics, no tracking and no advertising.
- The extension talks to exactly one host, `https://jira.uhub.biz`, and only to do what you ask: list your projects and tickets, and log time.
- Everything the extension saves stays in your browser profile on your computer. Nothing is synced to other devices.
- Your personal token is stored encrypted and is sent only to `https://jira.uhub.biz`.

## What the extension stores on your computer

| Data | Why | Where |
| --- | --- | --- |
| Your uHub personal token, encrypted | To sign in to Jira on your behalf | The extension's local storage |
| The encryption key for the token | To decrypt the token when a request is made | The extension's own database (IndexedDB) |
| The current timer: ticket key, title, status, project, start time and accumulated time | So the clock survives closing the popup or restarting the browser | The extension's local storage |
| Your default project and the last project you used | To preselect it the next time you open the popup | The extension's local storage |
| The list of Jira projects, refreshed every 12 hours | To open the popup without waiting for Jira | The extension's local storage |

None of this leaves your computer, except as described in the next section.

## What the extension sends, and to whom

The extension sends requests only to `https://jira.uhub.biz`, the Jira instance the data belongs to:

- Your personal token, in the `Authorization` header of each request, so Jira knows who you are.
- A request for your profile, used once to check that a new token works.
- A request for the list of projects, and for the open tickets assigned to you in the project you choose.
- When you press **Update Jira**: the ticket key, the time to log, the time the work started, and the work description if you wrote one.

Nothing is sent until you act. Time is logged only when you press **Update Jira**; **Cancel** discards it and changes nothing in Jira.

No data is sent to the developer or to any third party. The extension does not sell, share or transfer data, and does not use it for any purpose other than tracking and logging your time.

## How your personal token is stored

1. When you save a token, the extension first checks it against Jira. A token that Jira rejects is never stored.
2. An accepted token is encrypted with AES-GCM using a 256-bit key that the browser generates as a non-extractable key. The extension can use the key to encrypt and decrypt, but no script can read the key itself.
3. Only the encrypted token is written to the extension's local storage. The key is kept separately, in the extension's own database.
4. The token is decrypted in memory only at the moment a request is made, and is sent only to `https://jira.uhub.biz` over HTTPS. Requests never include your browser's Jira session cookies.
5. **Remove token** in the settings deletes both the encrypted token and its key.

If the browser's database is unavailable, the extension cannot create the key. In that case it stores the token unencrypted and the settings screen tells you so.

The encrypted token and its key both live inside your browser profile. This protects the token from being read out of the extension's storage files, but not from someone who has full access to your browser profile, so your computer's login and disk encryption are part of the protection.

## Permissions and why each one is needed

| Permission | What it is used for |
| --- | --- |
| `storage` | Saving the data listed above in the extension's local storage on your computer. |
| `alarms` | Waking the extension once a minute while a clock is running, so the toolbar badge shows the current elapsed time. It does nothing else. |
| `declarativeNetRequestWithHostAccess` | Adding one rule that sets the `Origin` header on the extension's own requests to the Jira REST API. Jira can reject requests that arrive from an extension's origin. The rule applies only to this extension's requests to `jira.uhub.biz`. It does not block, redirect or change any page you visit. |
| Access to `https://jira.uhub.biz/*` | Calling the Jira REST API to list your projects and tickets and to log time. This is the only site the extension can reach. |

The extension does not ask for access to your tabs, browsing history, bookmarks, downloads, cookies or any other website. It adds no scripts to web pages and cannot read or change the pages you visit.

In Firefox, the extension declares "authentication information" as data it transmits. This refers to your personal token being sent to `https://jira.uhub.biz`, as described above, and to nothing else.

## Private and incognito windows

The extension has not been built or tested for private or incognito windows.

## Removing your data

- **Remove token** in the settings deletes the token and its encryption key.
- Uninstalling the extension deletes everything it stored in your browser.
- Time already logged to Jira stays in Jira and is managed there.

## Changes to this policy

Changes are published in this file, with the date at the top updated.

## Contact

Questions or concerns: open an issue at <https://github.com/pabloviquez/jira-timetracker-firefox/issues>, or contact [Pablo Viquez](https://www.linkedin.com/in/pabloviquez/).
