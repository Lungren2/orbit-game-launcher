# Orbit

A desktop game launcher for `D:\Games`, Steam, Epic Games, and Xbox PC installations. Home is a full-width landscape-art carousel with Fluid CarouselDots selectors. Hover or keyboard focus reveals Play, game details and theme music controls over the selected game's art.

[![Orbit walkthrough showing game selection and Library search](docs/media/orbit-demo.gif)](docs/media/orbit-demo.mp4)

[Watch the full walkthrough](docs/media/orbit-demo.mp4)

Double-click `Launch Orbit.cmd`, or open `release\Orbit\Orbit.exe` after packaging. Keep the entire `release\Orbit` folder together when moving the app. The packaged app runs without Node.js. Games and Library work offline. PlayZip browsing works offline after the catalogue has been cached; game pages and downloads need an internet connection.

The header doubles as the window title bar. Drag its empty space to move the window, or double-click to maximize and restore. Native minimize, maximize, and close controls sit over the artwork and retain Windows Snap layouts. Navigation and utility buttons remain clickable. F11 switches to fullscreen.

The Orbit mark lives in `public/brand/orbit-mark.svg`, with its app tile in `public/favicon.svg`. Building generates PNG and multi-resolution ICO assets. Packaging applies the icon and Orbit product information to `Orbit.exe`.

## Development

Requires Node.js 22 or later on Windows.

```powershell
npm install
npm start
```

If your npm configuration blocks Electron's install script, run `node node_modules/electron/install.js` once after installing.

`npm run dev` opens the interface at http://127.0.0.1:5173. The browser preview reads your real library, but game launching and native folder dialogs run in Electron.

```powershell
npm test
npm run smoke
npm run check:home
npm run package
```

`npm run smoke`, `npm run check:home`, and `npm run check:ui` use the same production-renderer Electron harness. It checks the sandboxed bridge, installed-first collection, Fluid selects and dialogs, search, pagination, offline access, archive import, transfer recovery/deletion, uninstall cancellation, metadata controls, keyboard focus, audio continuity, the 30-second clock, reduced motion, collection sizes from 0 to 100 games, saved executables, and layouts from 900px to 4K. Launches and destructive actions are intercepted. It needs installed games in `D:\Games` and saves captures under `research/playzip/screenshots`.

`npm run check:types` checks the registry TypeScript components and the Vite link adapter. `npm test` exercises library scanning, launch validation, metadata, archive safety, HatchZip recovery, download deletion and music state using temporary fixtures.

## Interface components

Orbit uses React 19 and [Fluid Functionalism](https://www.fluidfunctionalism.com), with Tailwind 4 and Motion. Components use the Radix flavor, with the requested Base UI scroll area. The shared provider controls motion, density and shape. Header tabs, buttons, Library cards, search fields, selects, switches, dialogs, action lists, badges and scroll areas use the registry components in `src/components/ui`. Orbit compositions live beside them, with application state and Electron calls in `src/hooks/use-orbit.jsx`.

`src/design-system.css` owns the shared theme and registry tokens. `src/style.css` composes the launcher layout. Inter is bundled with its weight and optical-size axes. Registry source is kept intact; Vite resolves its `next/link` imports through `src/adapters/link.tsx`. Use the existing Radix registry flavor for future additions. The custom carousel uses the same spring/hover system and retains the always-enabled 30-second clock. The registry CarouselDots component receives that clock through its MotionValue progress prop, so its pill fill pauses with the artwork and preserves progress across routes. The component’s built-in autoplay is not enabled. The user-requested cinematic launch timing is named separately in `src/launch-artwork.js`.

Fluid Functionalism's MIT license and Inter's OFL license ship in `public/licenses`.

`npm run record:demo` refreshes the silent MP4 walkthrough and animated README preview in `docs/media`. It requires FFmpeg on PATH and games in `D:\Games`. It records the Electron renderer without launching games or starting downloads.

## Controls

Orbit also discovers Steam installations from local app manifests across Steam's registered library folders, installed Epic games from Epic's local manifests, and registered Xbox PC games with a MicrosoftGame.config. They appear in the Home carousel and Library collection. Game details identifies the platform. Steam launches use the Steam client; Epic launches use Epic Games Launcher; Xbox launches use the registered Windows app identity. Launcher shortcuts in the header open Steam, Epic Games Launcher and Xbox. Existing matching titles keep their Orbit IDs, artwork, favorites and music. Uninstalled account purchases and cloud-only Game Pass titles are not listed.

Steam discovery reads the Windows Steam registry entries and `steamapps/libraryfolders.vdf`, including libraries on other drives. It lists installed apps with an existing game folder, skips incomplete installs and Steamworks Common Redistributables, and uses the app ID for artwork matching. Steam handles authentication and any required updates when Play is pressed. No Steam Web API key or account connection is required.

Platform artwork overrides and metadata are cached under Orbit's user data in `platform-games`, so Steam, Xbox and Epic installation folders do not need write access. Xbox cover images can be read from the installed package. Rescan library in Settings refreshes the list; Windows package inventory is cached for up to 30 seconds. A platform discovery error leaves the local game folder available.

| Key | Action |
| --- | --- |
| Left / Right, Home / End | Select a game while a cover or dot has focus |
| Enter / Space | Activate the focused control |
| / | Search |
| F11 | Toggle fullscreen |
| Escape | Dismiss the hover overlay, close a dialog or return to Home |

Use the menu beside Play to favorite a game, open its folder, or choose its executable. Library combines installed games and the PlayZip catalogue. Installed games appear first on page one, followed by available games with Install controls. All games, Installed, Favorites, and Recent filters share the same search. The menu beside each installed game includes Uninstall. Recent tracks launches made through Orbit, not playtime or game progress. Settings lets you change the game folder, rescan, or view keyboard controls.

The scanner excludes common crash handlers, installers, and support executables. It recognizes several common games and searches up to six levels into other game folders. A unique executable matching the game name is selected automatically. When detection is ambiguous, choose the executable before playing. Folder-based games launch with their own directory as the working directory, without a shell or elevated privileges. Platform games use their registered launcher.

Favorites, recent launches, folder choice, and executable overrides are saved in Electron's user data directory at `%APPDATA%\orbit-game-launcher\library.json`. Local game uninstall moves its folder to the Recycle Bin after confirmation, including any saves inside that folder. Steam opens its uninstall prompt; Epic opens its library and Xbox opens Windows installed-app settings. Rescan after uninstalling through another app.

## PlayZip catalogue

Library caches PlayZip's full public catalogue on disk, including Popular and Latest listings for every genre. Search, genre filters and pagination use the local index after its first background sync. Installed games and active transfers count toward the same 100-card pages as catalogue results. Their catalogue copies are removed before paging, so full pages fill a ten-column, ten-row grid without repeating or skipping games. Only the final page can have fewer than 100 cards. Page numbers are clamped to the available range. Returning to a page reuses parsed records, and the next page is prefetched. Failed requests keep Previous and retry navigation available.

The catalogue refreshes in the background after 24 hours. Orbit keeps the previous complete index during refreshes and network failures, and resumes interrupted initial syncs from saved pages. Posters are cached as you browse, including read-ahead pages, and remain available after restart. Desktop cache files live in `%APPDATA%\Orbit\catalogue-cache`; the Vite preview uses a separate `%LOCALAPPDATA%\Orbit\catalogue-preview` directory. To populate the desktop metadata cache without opening Orbit, run `node scripts/cache-catalogue.cjs` while Orbit is closed.

Catalogue posters first paint a small 160px preview, then fade in the original image after it decodes. Offscreen cards load lazily. Cached originals and previews survive restart; a failed full-image request leaves the preview visible. Hover or keyboard focus expands a card over its neighbours to reveal the full title, platform and installation status. The grid keeps its spacing, edge cards expand inward, and reduced motion keeps the detail reveal without scaling.

An installed catalogue game returns to its Home card. An uninstalled game with no pending transfer opens its original `https://playzip.com/game/{id}` page in an iframe modal. The frame is sandboxed, has no launcher bridge or Node access, and is removed when the modal closes. Top-level navigation is blocked. In Electron, download links opened by the selected game's PlayZip download page are handed to the download manager; no popup window is opened. Other popups are denied. The browser preview does not enable downloads. Orbit does not remove or override PlayZip's embedding restrictions. The site currently allows embedding, but that could change.

Remote HTML is parsed as an inert document for listing metadata. Its scripts are not executed in the launcher. The catalogue fetcher accepts only fixed PlayZip routes and validated query values, with a timeout and response-size limit. See `research/playzip/README.md` for the inspected routes and markup contract.

## Downloads and imports

Open a catalogue game and use PlayZip's normal Download controls. Orbit associates the resulting transfer with the selected game. Pending games appear in Home and Library with progress and disabled game actions. The Library transfer menu offers pause/resume, cancel, retry and Delete download. Deleting a download cancels its transfer and removes private staged files, any unfinished installation owned by that download, and its history. It keeps installed games and the original manually imported archive. Deletion waits until an active extraction has finished. There is no Downloads page. The game and metadata are captured when the download starts, so opening a different catalogue page does not relabel an existing transfer.

Completed single-file ZIP and 7z archives are extracted into a private staging area beneath the game's destination root, then added to Library. Existing game folders are preserved; name collisions get a numbered folder. Extraction does not run installers or game executables. Game titles, PlayZip and Steam IDs, and artwork URLs are saved in `.orbit-game.json`. Artwork is cached in `.orbit-assets` when available, and served locally for offline use. These internal folders and incomplete imports are excluded from Library scans.

If more than one executable is plausible, choose the executable in the installed game's details. Archives with no detected executable also require a manual choice. Installers, multipart downloads, encrypted archives, and unsupported formats need manual handling. Retry installation resumes retained extraction state after a failure. Import archive in a game's modal retains that game's metadata; Library also has a general archive picker. A completed transfer stays nonlaunchable until the game is verified in the current library. Historical records whose installation is absent show Not in library.

The installed app saves transfer history to `%APPDATA%\Orbit\downloads.json`. Downloads go to `<game root>\.orbit-staging\<job id>`. Pause/resume applies while Orbit remains open and depends on the file server; after restarting Orbit, an unfinished transfer must be started again from the site. Orbit does not combine multipart archives, accept archive passwords, run installers, or automatically launch imported games.

Orbit integrates [HatchZip](https://github.com/xevrion/hatchzip) v0.1.2 for space-saving extraction of its managed ZIP/7z copies. HatchZip verifies the archive first, then consumes it progressively as files are extracted, with a 256 MiB free-space reserve. Manually selected source archives are copied into staging first and remain unchanged. Space savings depend on archive structure; a single solid 7z block can still require space for the entire decompressed block.

An interrupted installation retains the HatchZip journal, extracted files, and `.orbit-import.json` transaction beside the staged archive. Retry installation resumes there, including after the archive has been fully consumed but library setup is unfinished. Keep these files together until installation completes. Quitting Orbit stops its HatchZip process; retry can continue after reopening. A codec HatchZip cannot handle can fall back to 7-Zip before destructive extraction starts.

Orbit still validates archive paths, links, file counts, and declared sizes before extraction, then checks the extracted tree against its validated entry manifest. HatchZip checks its space plan before reclaiming any archive bytes. Runtime binaries and their license/provenance information are under `vendor/hatchzip` and `vendor/7zip`, copied into `resources/hatchzip` and `resources/7zip` in packaged builds. No separate HatchZip installation is needed.

The native end-to-end fixture check is `scripts/check-download-import.cjs`, run with Electron and `ELECTRON_RUN_AS_NODE` unset. It downloads a tiny local test ZIP through a sandboxed iframe, extracts it, checks executable detection and library metadata, and checks local artwork delivery. It never launches the fixture executable or downloads a real game.

## Home appearance and launch animation

Settings has separate switches for Jungle background and Fullscreen launch artwork. Jungle mode plays a silent 3840 x 2160 rainforest loop with subtle drift. Turning it off restores the selected game's wallpaper and unloads the video. Motion pauses while Orbit is hidden and follows the system's reduced-motion preference.

When Play is pressed, the selected game artwork expands to fill the Orbit window while the game launches in parallel. The image keeps its proportions and crops to cover the whole viewport. The zoom takes 1.6 seconds and the artwork stays visible for at least 4.8 seconds before fading away. A launch failure dismisses it promptly and shows an error. Reduced motion uses static artwork; the launch artwork switch can disable it. Both switches are saved locally. Launcher handoff does not indicate that the game has finished loading.

## Game theme music

Each installed game can play one local theme track. Music loops at a quiet saved level and crossfades over 600 ms when the selected game changes. It continues uninterrupted between Home and Library; a compact header mute button remains available outside Home. Every route uses the same selected-game or jungle background. Mouse wheel input snaps through games and fades music to silence; navigation and automatic cycling preserve that scroll pause. Music Play or deliberate non-wheel selection can resume, respecting saved mute. Music fades out when Orbit is hidden or a game launches. The 30-second countdown always starts enabled, with no pause button. Hover the game to freeze it; leave to resume. Focus and manual browsing do not permanently stop it. Reduced motion removes slide transitions. See `public/music/SOURCES.md` for each recording's source.

## Automatic and assisted game setup

Orbit fills missing artwork and game details in the background when a game is discovered or imported. It uses a saved Steam ID, a Steam ID found in the installed files, or a unique exact title match against Steam's public store. Uncertain matches stay unassigned. Successful and unmatched lookups are cached for seven days; Auto-configure in the setup panel checks immediately. The setting can be turned off in Settings.

Open Game details, then Artwork & music, to search and select a Steam match, choose cover/wallpaper/logo images, find theme music in the installed game folder, or choose a local audio file. Downloads and chosen files are cached beneath the game's `.orbit-assets` folder and recorded in `.orbit-game.json`. Your manually chosen artwork and music survive online metadata refreshes. Steam lookups use the game title or Steam ID, never the installation path.

Music is automatically selected when a unique clearly named playable menu/theme file is present. Otherwise Orbit offers candidates or a local file chooser. Packed sound banks and encrypted game archives require a separately available soundtrack file. Existing bundled game themes continue to work.

## Artwork

Artwork and logos are cached locally from each game's Steam store assets. They remain the property of their respective rights holders. These assets are for this personal launcher. The UI uses Noto Sans from the existing Cities: Skylines II launcher installation, under the SIL Open Font License. See `public/fonts/OFL.txt`.

Reference: [Sony's PS5 quick start guide](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1200a/CFI-12XXA_PS5_Quick_Start_Guide%24en.pdf). Orbit is an independent personal project.
