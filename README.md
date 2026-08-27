# Daily Planner PWA

An installable, offline-capable daily planner designed for low-friction adjustment. It uses only static files, so it can be hosted directly on GitHub Pages.

## What it supports

- Original color-coded action palette and categories
- Supplied iridescent image background with translucent, high-readability planner panels
- Natural finger scrolling in both the action bank and daily schedule, with no custom scroll rails
- Compact landscape action buttons and a schedule that never scrolls sideways
- Custom actions with editable names and colors, plus bank deletion that preserves scheduled events
- A Trent/Diane/Joint home chooser with separate, bookmarkable planner views
- Separate saved schedules and custom action banks for Trent, Diane, and Joint on the device
- A full 24-hour schedule in 15-minute increments
- Today opens at the nearest current hour; upcoming dates open at 6:00 AM
- Desktop mouse drag/drop, mobile tap-to-place, and 10-minute scheduled-event movement from a dedicated mobile move grip
- Mobile event bodies scroll naturally; press-and-hold opens calendar options without initiating a move
- Tap an action, then tap a time as an easier mobile alternative
- Move and repeatedly resize events up to 8 hours
- Automatic overlap prevention
- Per-date schedules saved in the browser
- Past dates disabled
- Delete with a 7-second Undo option
- Press-and-hold scheduled-action options to copy an item to Joint or move it between Trent and Diane without changing its time
- Optional five-minute browser/PWA reminders while the planner is running
- A compact Clear calendar control
- Schedules remain saved after reloads and exports until Clear calendar is chosen
- Mobile-friendly calendar handoff with a prefilled Google Calendar link for each scheduled item
- Native calendar-file sharing when the phone/browser supports it, with `.ics` download as a fallback
- Calendar-file exports include a five-minute alarm for every event
- Keyboard movement, resizing, and deletion
- Offline use after the first successful visit

## GitHub Pages

Upload all files and folders in this project to the same location that currently contains your Pages `index.html`. Keep the `js` and `icons` folders intact.

In the repository, open **Settings → Pages** and confirm Pages deploys from the branch and folder where these files live. The PWA uses relative paths, so it works from a repository subpath such as `https://username.github.io/daily-planner/`.

## Install on iPhone

Open the GitHub Pages link in Safari, tap **Share**, choose **Add to Home Screen**, then tap **Add**. Open the new Planner icon once while online so Safari can finish caching the app for offline use.

## Updating

Replace the changed files in the repository and commit them. GitHub Pages will publish the update automatically. If an iPhone still shows an older version, close the installed planner and reopen it while online.
