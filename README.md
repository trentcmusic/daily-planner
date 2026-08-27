# Daily Planner PWA

An installable, offline-capable daily planner designed for low-friction adjustment. It uses only static files, so it can be hosted directly on GitHub Pages.

## What it supports

- Original color-coded action palette and categories
- Supplied iridescent image background with translucent, high-readability planner panels
- A touch-friendly actions rail plus natural finger scrolling in the daily schedule
- Custom actions with editable names and colors, plus bank deletion that preserves scheduled events
- A full 24-hour schedule in 15-minute increments
- Today opens at the nearest current hour; upcoming dates open at 6:00 AM
- Mouse drag/drop and touch drag/drop
- Tap an action, then tap a time as an easier mobile alternative
- Move and repeatedly resize events up to 8 hours
- Automatic overlap prevention
- Per-date schedules saved in the browser
- Past dates disabled
- Delete with a 7-second Undo option
- A compact Clear calendar control
- Automatic schedule clearing after export and whenever the app reloads; custom actions remain saved
- Mobile-friendly calendar handoff with a prefilled Google Calendar link for each scheduled item
- Native calendar-file sharing when the phone/browser supports it, with `.ics` download as a fallback
- Keyboard movement, resizing, and deletion
- Offline use after the first successful visit

## GitHub Pages

Upload all files and folders in this project to the same location that currently contains your Pages `index.html`. Keep the `js` and `icons` folders intact.

In the repository, open **Settings → Pages** and confirm Pages deploys from the branch and folder where these files live. The PWA uses relative paths, so it works from a repository subpath such as `https://username.github.io/daily-planner/`.

## Install on iPhone

Open the GitHub Pages link in Safari, tap **Share**, choose **Add to Home Screen**, then tap **Add**. Open the new Planner icon once while online so Safari can finish caching the app for offline use.

## Updating

Replace the changed files in the repository and commit them. GitHub Pages will publish the update automatically. If an iPhone still shows an older version, close the installed planner and reopen it while online.
