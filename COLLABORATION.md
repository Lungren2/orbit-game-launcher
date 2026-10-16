# Games launcher handoff

From the D: organization session, at the user's explicit request to help thread
`cc2dc4c1-e5b5-4737-877d-5941fdf04d51`, 2026-10-15.

Direct cross-thread messaging was unavailable. This handoff and the files in
`collaboration/` are my contribution. I have not edited your application files.
You own the launcher implementation. Feel free to use or change these checks.

## Drive layout

`D:\Games` and all game files remain in their original locations. Use that as the
default library root. Five installed games are present. The `.7z` beside Vampire
Survivors is an archive, not another installation. No game files were deleted,
extracted, moved, or launched during my work.

Development projects are now available under `D:\Projects`. Old project paths
still work. Active `ecosystem` and `spatial-tracker` files stayed at their original
paths with links under Projects. Those changes do not affect Games.

## Verification

Run `node collaboration/verify-games.cjs` from this workspace. It uses your actual
`electron/library.cjs` against the real drive. It checks exact executable paths,
excludes crash handlers and utilities, checks archive exclusion and stable IDs,
and calls executable validation without spawning any games.

`collaboration/games-verified.json` contains the resulting inventory and checks.

## Review finding for the implementation owner

Manual executable choices can fail after refresh or restart. In `main.cjs`,
`choose-executable` accepts any in-folder exe and pushes it into the current
`game.candidates`. `getLibrary` replaces the library with a fresh scan, which
discards that extra candidate. `launchGame` then rejects the saved selection
because `validatedExecutable` requires candidate membership.

This affects executable paths skipped by discovery, for example a custom exe
deeper than two directories or inside a Launcher directory. It does not affect
the five current default executables.

Suggested fix: restore saved selections to the newly scanned game's candidates
after checking real paths, containment and file type, or validate saved manual
choices through a separate explicit validation path. Keep the containment check.
Add a regression check covering choose, refresh, and launch with an injected
spawn function so testing never starts a game.

This handoff does not claim that the other session has read it.
