# Jira Time Tracker for Firefox

A Firefox extension that times the Jira ticket you are working on and logs that time to the ticket when you stop.

## Looking for other browsers?

- [Jira Time Tracker for Chrome](https://github.com/pabloviquez/jira-timetracker-chrome)

## What it does

1. Click the stopwatch in the toolbar, choose a project and pick one of the tickets assigned to you.
2. Press **Start Clock**. The toolbar icon turns green and shows the elapsed time while you work.
3. Press **Stop Clock** when you are done. The extension shows the time it measured, which you can adjust, and lets you add an optional work description.
4. Choose what happens next:
   - **Update Jira** logs the time to the ticket's time tracking.
   - **Resume Work** continues the clock from where it stopped.
   - **Cancel** discards the time and changes nothing in Jira.

Every ticket has a **See in Jira** link that opens it in a new tab. The settings screen holds your uHub personal token and your default project.

The extension works with the Jira instance at `https://jira.uhub.biz`.

## Donations

Like what I'm building? Help me keep the ideas flowing.

Your support helps me keep working on these projects, trying new things, and turning _wouldn't it be cool if..._ into something you can actually use.

It's also a lovely nudge to keep creating, so thank you!

Got an idea for a new feature, an improvement, or something wildly ambitious? Send it my way! I can't promise I'll build everything. But I'll definitely review your suggestions and do my best to bring the ones I can to life.

Thanks for supporting my work and giving me another reason to make useful stuff.

[![Donate with PayPal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/donate/?business=ZR66BRGL7XS6N&no_recurring=0&item_name=Like+what+I%27m+building?+Help+me+keep+the+ideas+flowing.+Your+support+helps+me+keep+working+on+these+projects.&currency_code=USD)

Or scan the QR code:

<img src="donate-qr.png" alt="PayPal donation QR code" width="128" height="128">

## Benefits

- **Accurate time.** The clock measures the work as it happens, so you no longer estimate hours at the end of the day.
- **Fewer steps.** Start, stop and log from the toolbar without opening Jira or filling in the worklog form.
- **Always visible.** The icon colour and the elapsed-time badge show at a glance whether a clock is running.
- **Survives interruptions.** The clock keeps counting when the popup is closed or the browser is restarted.
- **You stay in control.** Nothing is sent to Jira until you review the time and press Update Jira.
- **Only your work.** The ticket list shows the open tickets assigned to you in the project you choose.

## Preview

_Screenshots will be added here._

## Change log

No public release yet.

| Date | Version | Description |
| --- | --- | --- |

## Security

Your personal token is checked against Jira before it is saved, and a token Jira rejects is never stored. An accepted token is encrypted with AES-GCM using a 256-bit key that the browser generates as a non-extractable key: the extension can use it to encrypt and decrypt, but no script can read the key itself. Only the encrypted token is written to the extension's local storage, and the key is kept separately in the extension's own database. The token is decrypted in memory only at the moment a request is made, it is sent only to `https://jira.uhub.biz` over HTTPS, and requests never include your browser's Jira session cookies. It is not synced to other devices, the extension has no access to any other website, and it collects no analytics or usage data. You can delete the token and its key at any time with **Remove token** in the settings.

Both the encrypted token and its key live inside your browser profile on your computer. This protects the token from being read out of the extension's storage, but not from someone who has full access to your browser profile, so treat the computer's own login and disk encryption as part of the protection.

## Roadmap

- **Support for all Jira instances.** Today the extension only works with `https://jira.uhub.biz`. The plan is to let you enter the address of any Jira instance, so it can be used outside uHub.
- **Private and incognito windows.** Tracking time from a private or incognito window has not been built or tested yet.
- **Sharing a session between window types.** A clock started in a standard window is not yet shared with private or incognito windows, or the other way round.
