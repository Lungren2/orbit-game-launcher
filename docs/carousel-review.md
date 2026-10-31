# Orbit carousel design review

Latest status: the rebuilt countdown/audio/download revision passes the targeted independent review. Elapsed dwell and focused-dot identity survive installation migration; stale-ready jobs offer catalogue-scoped reimport; unrelated general archives no longer collapse or falsely match legacy `local` manifests. All concrete findings raised in this review are closed. Installed desktop verification and the stated accessibility/input/audio limits remain with the implementation owner. Earlier findings remain as dated history, not open defects.

Reviewed 22 October 2026 in `D:\Projects\Orbit`, against HEAD `3aad8b7` and the existing uncommitted work. This is a proposal review, not acceptance of the forthcoming carousel implementation. Application code, installs, the old checkout, and other contributors' files were left untouched. No runtime or assistive-technology test was performed for this review.

## Verdict

Proceed with the requested visual direction, subject to the checklist below. The proposal is incomplete if it only stops on mouse hover. It also needs an explicit stop/start control, keyboard handling, stable access to the action overlay, and an audio policy that does not follow every automatic cover change.

The carousel is an artistic preference, not a demonstrated improvement to finding or launching games. Keep Library available as the stable, searchable alternative. Do not describe this redesign as more accessible or more usable before testing it.

## What is supported, and by what

WCAG success criteria are normative accessibility requirements. W3C Understanding documents explain those criteria; WAI tutorials and ARIA APG provide implementation guidance. Microsoft and Material guidance describe their own design systems. None is evidence that this particular launcher has passed an accessibility audit or user study.

| Proposed choice | Rationale and limit |
| --- | --- |
| Full-width rotating cover carousel | Explicit user artistic requirement. [Android's Material carousel documentation](https://developer.android.com/develop/ui/compose/components/carousel) supports related visual collections adapting to window size, but does not establish that continuous autorotation improves task completion. |
| Stop on hover | Explicit user requirement, also supported by the [WAI animation tutorial](https://www.w3.org/WAI/tutorials/carousels/animations/). Hover must not be the only stopping mechanism. |
| Title, Play, details, and music controls revealed over the carousel | Explicit user requirement. Keyboard equivalents follow [WCAG 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html). The overlay's hover behavior must satisfy [WCAG 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html). |
| Remove Home search, promotional headings, and visible game count | Explicit user request for less copy. Preserve Library search and accessible control names. Removing promotional text does not justify removing semantic labels. |
| Blur wallpaper beneath the carousel; remove the cover panel | Explicit user artistic requirement. These are separate layers: blur the backdrop, keep cover art sharp, and do not recreate a frosted rectangle behind the covers. |
| Restrained volumetric lighting behind covers | Explicit user artistic requirement. No researched source establishes volumetric beams as an accessibility or usability improvement. Intensity, beam shape, and color remain artistic choices requiring visual review. |
| Localized backing behind action text | Reviewer recommendation to achieve measurable contrast, grounded in [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). It can be a small gradient or opaque action surface rather than a cover panel. |
| Keep native title-bar controls and header drag behavior | Existing product requirement, supported by Electron's [title-bar overlay](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar) and [draggable-region documentation](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions). |

The [Material 3 overview](https://m3.material.io/components/carousel/overview) returned a JavaScript-only shell during this review. It is not used as evidence for unverified layout, timing, or autoplay rules. The accessible Android documentation above is the substantive Material reference.

## Must-fix acceptance checklist

Unchecked means not yet verified, not a confirmed defect in the new code.

- [ ] **Provide an explicit rotation control.** Keep a recognizable stop/start button available outside the hover-only action layer. Give it an accessible action label. Continuous decorative movement lasting over five seconds alongside other content needs a user-operated pause, stop, or hide mechanism under [WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html). Slower motion and hover alone do not resolve this.

- [ ] **Separate temporary hover pause from deliberate stop.** Freeze motion on pointer entry, and pause on keyboard entry. Following [APG carousel guidance](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/), keyboard interaction must not automatically restart rotation. Put the rotation control first in carousel tab order and supply previous/next buttons. Do not resume after an explicit stop just because the pointer leaves. Stop while a dialog is open, a launch is pending, or the app is hidden. These last suspension rules are engineering recommendations to prevent context changes during another task, not additional WCAG text.

- [ ] **Honor reduced motion in JavaScript as well as CSS.** Start stationary under `prefers-reduced-motion: reduce`, respond to preference changes, and preserve manual navigation. Disable smooth scrolling, rotating transforms, and animated light movement in that mode. [APG's example](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/) demonstrates reduced-motion handling. [WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) is AAA, not an AA requirement; it still provides relevant guidance for interaction-triggered effects. Existing jungle and vortex preferences must continue to work.

- [ ] **Make the overlay reachable and persistent.** Keyboard focus must reveal the same useful actions as pointer hover. Moving from a cover into its actions, or tabbing into Play, details, mute, or volume, must keep it visible. Where it obscures other content, provide dismissal without moving focus, typically Escape. Prevent immediate reopening while the same trigger remains active after dismissal. These follow [WCAG 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html). For touch and other non-hover input, provide a deliberate reveal action; do not turn the first tap into an unexpected launch. That tap behavior is a reviewer recommendation to satisfy equivalent access, not a prescribed WCAG gesture.

- [ ] **Preserve control identity and keyboard ownership.** Update transforms and selected presentation without replacing the focused DOM subtree every animation tick. Cover selection must not move focus into Play or start a game. Keep normal Tab/Shift+Tab navigation, and scope carousel arrow handling to its own interaction area. Volume range arrows, header controls, and modal controls must retain their native behavior. [WCAG keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) requires all functionality to work without timed keystrokes. [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) also applies when overlays are present.

- [ ] **Avoid duplicate accessible covers.** If a seamless loop uses cloned cards, remove clones from the accessibility tree and tab sequence. Never focus a clone under `aria-hidden`. Use a labeled group/region and appropriate slide semantics, or a coherent collection pattern; do not combine tab/listbox semantics without implementing their keyboard model. Announce deliberate selection succinctly and suppress automatic live announcements while rotating, following [APG](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/). The visible count can stay removed.

- [ ] **Decouple automatic motion from audio.** Moving a cover through the center must not repeatedly replace the soundtrack. Keep music tied to deliberate user selection, or require explicit playback before it begins. Persist mute and volume; never unmute on hover, focus, or auto-advance. If sound starts automatically for longer than three seconds, its independent stop or volume control must remain discoverable and keyboard reachable under [WCAG 1.4.2](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html). A hidden mute control with no reachable reveal path is unacceptable. Keeping a small persistent mute affordance while audio plays is the preferred reviewer recommendation if overlay-only controls prove undiscoverable.

- [ ] **Measure contrast against the actual composition.** Blur alone does not guarantee text contrast. Test bright and dark art, jungle frames, missing art, and lighting enabled. Ordinary action text needs 4.5:1 and qualifying large text 3:1 under [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); required control/state cues need 3:1 against adjacent colors under [WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). A luminous halo is not a substitute for a stable focus indicator. [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) sets a 24 CSS-pixel target minimum or applicable spacing/exceptions; the icon drawing is not the hit area.

- [ ] **Verify scaling, not just 4K screenshots.** Check 900 x 650, 1366 x 768, 1920 x 1080, and 3840 x 2160, plus Windows scaling and 200% text enlargement. Test long titles, missing art, and 0/1/2/24/100 games. These exact fixtures are reviewer test choices. [WCAG resize-text guidance](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) requires no loss at 200%; [reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) concerns narrow effective viewports, not only larger physical displays. Do not claim full reflow conformance from desktop sizing tests alone.

- [ ] **Keep effects subordinate to operation.** Put blur and lighting behind covers and action controls, mark decoration as hidden to assistive technology, and prevent decorative layers from intercepting pointer input. Prefer a restrained static light treatment initially; any motion is an additional artistic decision. Verify frame pacing during motion and pointer entry with jungle playback enabled. No fixed blur radius, animation duration, or frame-rate result is established by this review.

- [ ] **Preserve the existing product paths.** Regression-check Epic, Xbox/AUMID, and local selection and launch dispatch without starting real games; Epic/Xbox launcher shortcuts; Library search; catalogue and its modal; Downloads; Settings including jungle/vortex; game details and metadata; mute persistence; native minimize/maximize/close, drag, fullscreen, and caption-button clearance. The first items are explicit product requirements. Electron warns that draggable regions ignore pointer events, so carousel interactions must not inherit a header drag region. [Electron interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)

## Current implementation hazards to revisit

At the time of inspection, `src/main.js` still renders the Home grid, promotional headings, Home search, and a separate hero. `src/style.css` still gives Home's `.game-rail` a background, border, and `backdrop-filter`. These identify the old implementation to replace, not failed checks of the upcoming carousel.

`select()` currently calls `render()`, which replaces `main.innerHTML`, and `render()` calls `music.select(current(), ...)`. Reusing that route for automatic progression would couple animation to DOM replacement and soundtrack changes. Use stable DOM and separate presentation motion from explicit game selection. This is a code-based risk assessment, not a claim that the future implementation already has the defect.

The document-level arrow handler currently navigates Home after excluding inputs/textareas, but not all other control types. Recheck that scope when action controls move into the carousel. The existing CSS reduced-motion rule cannot stop a new JavaScript timer by itself.

Music currently defaults to unmuted unless saved otherwise in `src/theme-music.js`, while `electron/window.cjs` permits autoplay without a gesture. Preserve the user's saved choice, but do not accidentally broaden automatic playback while hiding its controls.

## Visual restraint and source honesty

[Fluent material guidance](https://fluent2.microsoft.design/material) assigns acrylic to transient surfaces and smoke to modal blocking context. It does not recommend a persistent frosted cover tray or volumetric spotlights. A dark nonmodal contrast gradient must not be described as Fluent Smoke. CSS wallpaper blur must not be described as native Mica or Acrylic. Removing the cover tray fits the user's request; it is not a requirement imposed by Fluent.

The requested wallpaper blur and lighting should be reviewed separately with effects toggled off and on. Covers, selected actions, and focus cues must remain legible in both. Negative space is acceptable when it exposes useful art; filling it with additional beams, particles, promotional labels, or controls is not justified by the sources or the brief.

## Evidence required for acceptance

Before signing off, record keyboard-only entry, pause, next/previous, Play/details, mute/volume, and exit; pointer travel from cover into actions; Escape dismissal; reduced-motion startup and a live preference change; screen-reader names and announcements; and the scaling/contrast checks above. Confirm user pause survives mouseleave and view changes. Confirm an automatic cover cycle leaves the chosen game's audio unchanged. Screenshots alone cannot establish these behaviors. APG explicitly requires testing examples with assistive technology before production use.

Status: proposal reviewed, implementation acceptance pending. Only this review document was authored by this reviewer.

## First implementation review and revised brief

Reviewed `src/carousel.js`, `src/carousel.css`, relevant `src/main.js` integration, `docs/carousel-design.md`, and `scripts/check-carousel.cjs` on 22 October 2026. Inspected the actual rest and hover PNGs and `carousel-verified.json` at `C:\Users\yangb\Documents\Codex\2026-10-15\g\outputs\carousel-redesign`. These are the first poster-carousel implementation, before the new Netflix-directed revision.

Additional evidence came from a separate temporary Electron probe using the built production renderer, the real preload, a private temporary profile, and synthetic games. It mocked launch IPC, muted audio, and did not modify application code or install anything. The probe lives outside the repository at `%TEMP%\orbit-independent-carousel-review.cjs`. Its observations are reproduced below so the report does not depend on that temporary file remaining available.

### Release blockers

#### P1: The art treatment no longer meets the revised brief

The user now says the art must occupy far more space, controls should be dots, and Netflix above the fold is the reference. The reviewed screenshots show separated portrait cards and a heavily blurred backdrop. In the rest image, the selected artwork is approximately 272 x 352 within a 1360 x 720 frame, about one tenth of its area, with a large empty region to its left. DOM width equalling viewport width is not evidence that the game art dominates the viewport.

For the next pass, use the selected game's landscape hero art as the dominant sharp visual surface. Preserve a readable action area and accommodate portrait-only or missing art intentionally. This is an interpretation of the user's artistic direction, not a measured usability finding or a prescribed image-percentage threshold. Do not stretch a portrait capsule to landscape or blur the entire primary hero until little recognizable art remains. Reinterpret the earlier blur request as supporting backdrop treatment beneath the carousel composition, while keeping the featured art legible.

Netflix's [official announcement of its redesigned TV experience](https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience) and [official layout explanation](https://www.netflix.com/tudum/articles/netflix-new-tv-layout) are primary references for Netflix's own presentation. They do not prove that a borrowed hero arrangement improves Orbit's launch speed, accessibility, or satisfaction. The phrase "Netflix above the fold" is not a specification for exact dimensions, auto-preview audio, or dot navigation. Dots are the user's separate explicit requirement.

Replace the previous/next navigation presentation with accessible game-selector dots. Keep a distinct, discoverable stop/start control for automatic motion; a dot indicating the current game cannot also silently stand in for that operation. Dots need meaningful game names, visible selected/focus states, and sufficient hit areas even if their drawn circles are small. Do not create 100 sequential tab stops or a clipped hundred-dot row. Choose a documented button or tab pattern, handle a large library deliberately, and retain access to the complete Library. [APG carousel guidance](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) distinguishes selectors from rotation control; [target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) concerns interactive area, not painted dot diameter.

#### P2: Saved executable overrides can leave Play disabled

Location: `src/carousel.js`, the per-slide `play.disabled` assignment. It checks only `executable`, `launchUri`, and `aumid`. It does not consider `library.executables[id]`, even though the launch handler accepts that saved override and the previous renderer included it in Play availability.

Independent fixture: a game with no detected executable plus a valid saved custom executable. Observed output was `SAVED_EXECUTABLE {"id":"1111111111111111","disabled":true}`. This matters when a user explicitly chooses an executable that discovery skips or cannot detect. A saved override is passed separately by `getLibrary()` and is not necessarily copied into the game's `executable` field.

Pass a resolved launchability predicate or the saved overrides into the carousel. Add a fixture that selects an executable, refreshes, and verifies Play remains enabled and dispatches the selected game's launch through mocked IPC. Do not weaken main-process executable validation.

#### P2: Escape suppression survives deliberate keyboard navigation

Location: `src/carousel.js`, Escape handling, `select()`, and previous/next handlers. Escape adds `overlay-dismissed`. Clicking a cover clears it, but arrow-based selection and previous/next selection do not. Thus the next selected game's action overlay stays inert and hidden even after deliberate keyboard navigation.

Reproduced by focusing a cover, dismissing its revealed actions with Escape, then pressing Right. Observed output was `ESCAPE_ARROW {"dismissed":true,"active":"2222222222222222","inert":true,"visible":"hidden"}`. Tab then cannot enter that game's hidden actions. This contradicts the promised dismissal rule that a deliberate selection reveals controls again.

Clear dismissal on deliberate selection, including keyboard and future dot activation, while preserving suppression during automatic motion and incidental focus movement. Recheck that the same Escape event does not immediately reopen the overlay. [Keyboard equivalence](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) and [hover/focus predictability](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) are the relevant constraints.

#### P2: Refresh and launch lose action-control focus

Location: `src/main.js`, `render()` focus capture/restore, combined with the new carousel's initially inert overlay. The old focused control is removed. The new carousel initially sees focus on `body` and keeps actions hidden/inert. Attempting `.focus()` on the replacement Play button cannot enter that inert subtree.

Independent keyboard probe verified focus on Play before sending `library-updated`. Before refresh: `{"focus":"play","overlay":false,"playDisabled":false,"vis":"visible"}`. After refresh: `{"focus":"","tag":"BODY","inert":true}`. A mocked launch completion likewise returned focus to body with hidden/inert actions. The probe waited for the reveal transition before focusing Play, rather than treating an immediate failed focus call as a renderer defect.

Restore a logical game-and-control identity after reconstruction. Reveal the appropriate active action region before restoring focus, or retain and update that region instead of replacing it. Include keyboard-activated Play, metadata-triggered refresh while Play or mute is focused, and dialog return in the regression check. The current assertion that a previously focused tile remains connected during arrow selection does not cover full-render refreshes.

### Positive evidence and remaining gaps

The first implementation keeps carousel DOM stable during automatic movement, supplies explicit stop/start, pauses on hover and keyboard entry, retains a deliberate stop, avoids cloned cards, and disables automatic motion under reduced motion. The supplied evidence shows those exercised paths passing. The screenshot also confirms removal of the frosted tray and promotional toolbar. These findings do not override the new visual direction or the reproduced defects above.

The check report's scaling data measures document overflow, cover height, and navigation bottom position. It does not establish action-overlay visibility, readable long titles, usable volume at 200% text enlargement, caption-button clearance, real Windows display scaling, or contrast over arbitrary artwork. The 100-game fixture currently checks count and page overflow, not how long keyboard users need to reach a particular game. Preserve these distinctions in the design document and completion report.

The initial rendered screenshot contains missing or unsuitable art for some platform entries. For example, the shown Forge artwork is enlarged lettering, while Fall Guys uses a text fallback. These are not proven carousel regressions, but the new dominant-hero design needs a fallback policy before acceptance. Avoid claiming all game imagery is complete from a no-console-error check.

Audio routing appears intentionally separated: automatic selection retains the previously chosen `musicGameId`. That is a sound direction, but this review did not verify actual audio playback or announcements with assistive technology. Specifically test explicit Start while its button retains focus, actual automatic active-game changes, saved mute/zero volume, moving the music control between game overlays, and access to mute after Escape or an asynchronous refresh. No state change should unmute without the user's deliberate action.

The design map should describe the roving cover stop as an implementation choice that needs its own keyboard tests, rather than implying APG prescribes this exact combination of slide groups and roving card buttons. Likewise, Fluent material and motion descriptions justify neither the exact beam/glow appearance nor a claim of measured performance. The map already labels chosen speeds and blur values as artistic implementation choices; preserve that honesty in the hero/dot revision.

### Required next review evidence

- [ ] New rest and hover/focus screenshots demonstrating the revised dominant hero-art composition and dot navigation.
- [ ] The three reproduced P2 defects fixed and tested with meaningful fixtures.
- [ ] Dots checked at 0/1/2/24/100 entries, keyboard-only operation, selected-name announcements, reduced motion, and small drawn dots with sufficiently large hit areas.
- [ ] Independent pause/start retained outside the hover-only action layer and working after pointer entry, keyboard entry, explicit restart, and view changes.
- [ ] Text enlargement, contrast, focused-overlay reachability, and native-window clearance checked beyond page-overflow assertions.
- [ ] Actual platform routes, Settings/jungle/vortex, Library, catalogue, and installed desktop behavior verified by the implementation owner before release.

Updated verdict: release acceptance withheld pending the revised visual brief and the functional fixes above. No installation, packaging, commit, application edit, or old-checkout change was made by this reviewer.

## Second review: hero art and dot navigation

Inspected the current `src/carousel.js`, `src/carousel-hero.css`, relevant `src/main.js` integration, updated design rationale, and latest supplied hover screenshot. The production bundle inspected by the independent probe was `index-DFQxRtVM.js`, built after the reviewed source updates. The implementation owner's expanded production check was still in progress when this review began; this addendum does not assume a final pass from that run.

### Improvements independently confirmed

The supplied screenshot now presents a large sharp landscape hero, adjacent peeks, dot selectors, and a separate circular rotation control. It addresses the user's art-scale and dot-navigation steering. Readability backing stays concentrated toward the actions rather than replacing the complete image with an opaque panel. No new claim of Netflix-proven usability is needed.

Re-running the original synthetic production-renderer probes confirmed:

- A game with no detected executable and a saved override now has Play enabled: `SAVED_EXECUTABLE {"disabled":false}`.
- Escape followed by Right now selects the next game, clears suppression, and reveals its action region: `{"dismissed":false,"inert":false,"visible":"visible"}`.
- With Play focused before `library-updated`, the replacement Play receives focus and its region remains interactive: `AFTER_REFRESH {"focus":"play","tag":"BUTTON","inert":false}`.
- The original mocked-launch focus probe returns to Play with its region interactive: `AFTER_LAUNCH {"focus":"play","tag":"BUTTON","inert":false}`.

Those reproduction paths are closed. The hero supports contained package imagery rather than stretching it, and reduced-motion changes call `measure()` to recenter the active art. Code inspection confirms both changes; artwork quality and actual screen-reader behavior still need their own checks.

### Remaining P2: An asynchronous refresh loses dot focus

Location: `src/main.js`, `render()` focus identity capture, plus carousel dot creation in `src/carousel.js`.

Dot buttons carry `data-dot`, but no `id`. `render()` captures only a focused element's ID or a cover's `data-id`. A focused dot therefore has neither restore identity. When the carousel is reconstructed during metadata/library updates, its keyboard focus falls back to `body`.

Independent reproduction: focus the current game dot, send `library-updated`, wait for the library/render response. Before: `DOT_BEFORE_REFRESH {"dot":"2222222222222222"}`. After: `DOT_AFTER_REFRESH {"tag":"BODY"}`. The fixture deliberately keeps the same game present, so removal of the focused game is not the cause.

Capture dot identity by game ID and control kind, then restore that corresponding dot after reconstruction. Keep its roving tab stop and selected state coherent. If the game disappears, choose a documented logical fallback. Add a refresh check with a dot actually focused, rather than extending the passing Play-focus assertion to cover all controls. The new dots are the primary navigation surface, so losing their keyboard position during automatic metadata refresh is a release issue. [Keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) and [WAI carousel focus guidance](https://www.w3.org/WAI/tutorials/carousels/) support predictable, usable keyboard navigation.

### Remaining P2: Escape suppression still survives deliberate wheel navigation

Location: `src/carousel.js`, `onWheel` and `onScroll`. The fix clears `overlay-dismissed` in `select(...source: 'manual')`. The wheel/scroll route instead calls `activate(..., 'manual')` directly, bypassing that fix.

Independent reproduction: focus the selected cover, press Escape, then scroll the carousel to another game using a vertical wheel delta. Observed: `ESCAPE_WHEEL {"dismissed":true,"active":"3333333333333333","inert":true}`. The selected game changes, but its actions remain hidden and inert. This is the same incomplete deliberate-navigation contract as the previous arrow defect, through a different input path.

Apply the deliberate-reveal policy consistently to manual selection, including wheel/touch scroll if those remain game-selection inputs. Keep automatic transitions and incidental focus movement from undoing an intentional Escape dismissal. Test the actual selection change as well as visible/interactable actions; checking only the selected dot is insufficient. [Hover/focus guidance](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) remains relevant to predictable overlay behavior. Clearing suppression on deliberate wheel selection is the product's stated policy, not a wheel-specific instruction imposed by WCAG.

### Acceptance boundary

The visual-direction blocker is closed, and the three original reproduction paths are verified fixed. Resolve the two gaps above before release. The latest screenshot does not certify contrast, native caption-button clearance, 200% text behavior, installed desktop operation, or assistive-technology announcements. Use the implementation owner's forthcoming expanded report for its specific measured assertions, keeping its scope explicit.

Only `docs/carousel-review.md` was changed in this review. Temporary independent probes used a private profile and mocked launches. No application edits, builds, installations, packaging, commits, or old-checkout changes were performed by this reviewer.

## Final follow-up: reproduced blockers closed

Rechecked the current source and built production renderer `index-CHpf8ZBU.js`, built 22 October 2026 after the two follow-up fixes. Re-ran the separate temporary Electron probe with a private profile and mocked launch IPC.

Dot buttons now have stable IDs based on game ID, allowing the existing render/restore path to retain the current selector. Independent output before refresh was `DOT_BEFORE_REFRESH {"dot":"2222222222222222"}`. After `library-updated` it was `DOT_AFTER_REFRESH {"tag":"BUTTON","dot":"2222222222222222"}`. The same dot retains keyboard focus; the second-review focus defect is closed.

Manual activation now clears dismissal centrally in `activate()`, including the same-game branch. After Escape followed by wheel navigation to another game, independent output was `ESCAPE_WHEEL {"dismissed":false,"active":"3333333333333333","inert":false}`. The newly selected game's action region is interactive. Automatic/focus activation does not take this manual-clear path. The second-review wheel defect is closed.

The same run reconfirmed Play enabled for the saved-executable fixture, Escape/Right revealing the new game's actions, and Play focus retained after library refresh. The earlier isolated mocked-launch focus probe already passed after its fix. These observations close the five concrete behavioral findings raised across the prior reviews.

The implementation owner's expanded evidence report now records refreshPlay, refreshMusic, refreshDot, escapeThenArrow, launchFocus, savedExecutable, reduced motion, audioUnchanged, scale/count fixtures, and no collected renderer errors. It also records selected-art area fractions from approximately 0.64 to 0.88 at the tested viewport sizes, and 28 x 32 CSS-pixel dot targets. Those are specific measurements from that harness, not proof of user preference or all accessibility requirements.

Keep the contrast and enlargement claims narrow. The contrast check samples title/music backing beside text over a synthetic white hero background. It does not exhaustively measure every text pixel, control boundary, focus state, or possible image composition. The text-enlargement fixture doubles selected title/action/music text and verifies volume reachability; it is not a complete browser zoom or Windows display-scaling test. The reviewer did not perform a real screen-reader session or verify the installed application. Those are evidence limits, not newly demonstrated release defects.

Final verdict: accepted for the reviewed design and reproduced functional paths. No remaining concrete blocker was found in this snapshot. The implementation owner remains responsible for the planned installed desktop verification and final release checks. This acceptance is not WCAG certification, a user study, or a guarantee covering future changes. Historical unchecked proposal items above should be read alongside the concrete evidence and limits in these dated addenda, not as a claim that every proposed manual test was performed.

Only this review document was updated. No application edits, builds, installs, packaging, commits, or old-checkout changes were performed by this reviewer.

## New scope: countdown, audio, scrolling, pending installs, and logo

This is an architectural review of the next requested change, not verification of its finished implementation. Only this document was updated; no source changes, builds, installs, or packaging were performed. The current user requirements supersede earlier seven-second timing and Downloads-page assumptions.

The implementation plan is reasonable if it separates three kinds of state: carousel timing/navigation; audio intent/playback; and installed-library/download-job state. A single selected-game variable plus repeated full renders is likely to produce regressions across all three.

### Source rationale and artistic choices

The 30-second period, active-dot fill/countdown styling, audio fade character, wheel notching, removal of the Downloads page, and new logo are explicit user requirements. No primary source establishes their exact durations, thresholds, curves, colors, or shapes as universally better.

Keep the independent rotation control and keyboard/hover stopping from [WAI carousel guidance](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) and [WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html). The dot remains a named selector. Add its visual fill without replacing its button semantics with `meter` or `progressbar`; those roles are not interactive selectors. A timer fill can be decorative when equivalent timing/paused state is available in accessible text. Native `<progress>` or the [ARIA progressbar role](https://www.w3.org/TR/wai-aria-1.2/#progressbar) is appropriate for an actual download task; omit a numeric value when total size is unknown. [APG explicitly distinguishes meters from task progress](https://www.w3.org/WAI/ARIA/apg/patterns/meter/).

Announce meaningful download phase changes without moving focus, using [WCAG status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). Do not turn every byte update or countdown frame into a live announcement. Independent mute/volume remains required for qualifying automatic audio under [WCAG audio guidance](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html); a fade does not replace control over playback. Wheel delta units vary, as documented in the [UI Events WheelEvent interface](https://www.w3.org/TR/uievents/#interface-wheelevent). That specification is a Working Draft; neither it nor a raw delta supplies a universal physical-notch count.

### Countdown integration traps

Current `freezeAutomatic()` and `rotation.onclick` reset `idle`; `select()` also resets it. Those old resets must not survive accidentally when hover/focus now freezes elapsed time. Keep elapsed dwell independently from transition progress. Start each new slide's dwell at a documented boundary, preferably after its arrival settles, and reset it on deliberate selection as planned. Keep a single authoritative 30-second clock for the graphic, remaining-time text if supplied, and advance decision.

Do not replace game cards, dot buttons, or their accessible names every animation frame. Do not call the ordinary selection/audio callback solely to update fill. Update a presentation property on the active dot and semantic state only as needed. Preserve current paused intent, selected ID, elapsed dwell, and focus through metadata updates and download snapshots. A saved preference should retain stopped/started intent; persisting a partial timer across app relaunch is a separate product choice, not required here.

Hidden windows, dialogs, launches, reduced motion, and explicit Stop must freeze the clock as well as the visual fill. Refreshing `previousTime` while suspended avoids hidden wall time advancing the game immediately on return. Reduced motion should keep manual dot navigation useful and disable automatic advancement/countdown motion; it must not imply audio is muted. One game has no next-slide countdown. With zero games but an active download, the pending entry still needs a real display path rather than the old `library.games.length === 0` empty-state early return.

### Audio intent and fade integration traps

The existing music controller clears `src` and discards the Audio object in `stop()`, so it cannot produce a true fade-out merely by adding another volume loop after that cleanup. Model outgoing and incoming tracks explicitly. Retain each outgoing Audio object until its fade reaches zero, then pause/unload that exact object. Track ownership and cancellation must be per instance; a stale promise or fade callback must never pause, unmute, or change the volume of the latest track.

Choose and document a fade duration/curve. Bound the combined gain during any overlap, and remove superseded tracks/timers promptly. Volume edits, zero volume, mute, switching to a game without music, failed playback, navigation out of Home, launch suspension, hidden-window handling, and disposal all need defined precedence. Smooth transitions must still respect explicit Stop/mute immediately in state and promptly in audible output. Do not persist an incidental fade gain as the user's volume preference.

Use an explicit navigation reason such as `wheel`, `dot`, `cover`, `keyboard`, `automatic`, or `refresh`. Calling every wheel selection `manual` currently engages music through `updateSelectedGame`; that would directly defeat the new scroll-to-pause rule. The old `suspend()` is tied to the selected track and selection changes clear it, so a durable scroll-pause intent must not be represented solely by that existing field.

After wheel pause, hover/focus changes, automatic cycling, download updates, ordinary refresh, and rotation Start must remain silent. Explicit music Play or deliberate non-wheel selection may re-engage music as planned. Retain the saved mute choice and volume. The control label/icon must distinguish paused music from currently playing-but-muted music; otherwise clicking a control labeled Mute can mute an already paused track instead of providing the promised explicit resume action. Keep game Play and music Play separately named.

### Wheel and scroll integration traps

The current carousel has both wheel and scroll listeners, with the scroll path also performing selection. Avoid double navigation, accidental audio restart, or duplicate timer resets when the wheel starts an animated snap and resulting scroll events arrive afterward. Normalize pixel/line/page inputs, accumulate small deltas, and distinguish a gesture burst from a new intent. The existing 420 ms cooldown is only a tunable heuristic: a long momentum stream can outlast it, and two intentional wheel notches can arrive within it.

At a carousel boundary or with a one-game collection, meaningful scroll intent should still pause music, even if no next index exists. Decide whether tiny accidental movement below the navigation threshold pauses sound; document and test the chosen policy. Ignore Ctrl+wheel zoom, zero deltas, and unrelated page/iframe scrolling. Preserve scrolling of enlarged overlay content and dot overflow. Do not hijack the volume range or make a small scroll over mute unexpectedly navigate to another game.

If ordinary overlay scrolling is meant to pause music under the user's wording, suspend audio before returning control to that scrollable region, while leaving the page selection unchanged. Keep native touch/trackpad scrolling and keyboard dot navigation available. A synthetic WheelEvent alone does not verify actual trackpad momentum or default scrolling; include a real input check before release.

### Pending-download identity and lifecycle traps

`DownloadManager` has a UUID per job, a numeric PlayZip `job.game.id`, an optional imported local `gameId`, and `job.root`/`job.folder`. Installed games have their own stable IDs. These identifiers are not interchangeable. Use namespaced synthetic presentation IDs and retain the original job/catalogue/local IDs separately. Do not infer identity from game name alone. Handle multiple attempts, historical failed/cancelled jobs, another selected library root, and already installed Epic/Xbox/local copies without duplicating or disabling a real installed game.

Do not equate `received === total`, `downloadComplete`, `job.folder`, or historical `ready` with a currently verified playable installation. Transfer completion is followed by queued extraction/import, and an import may end in `needs-executable`. A previously installed folder can later be removed. Derive installed/launchable state from the current library and valid route/override. Keep downloading, paused, interrupted, queued, extracting, importing, failed, cancelled, needs-attention, and needs-executable visibly distinct. Unknown total size is indeterminate, not 0% or 100%.

Pending synthetic entries must never inherit a cloned installed fixture's executable, launch URI, AUMID, saved override, or main-process game ID. Omit or disable launch/open actions consistently in both carousel and Catalogue, and guard callbacks themselves. Block Play, Enter/Space launch paths, details-to-open-folder, stale click closures, and context actions until installation makes them valid. Selection and status inspection must remain possible. A setup action to choose an executable is distinct from launching; preserve that route for a completed but not yet configured import.

The existing `download-folder` IPC can open an archive directory before installation. Do not expose that old action on an uninstalled status card merely by reusing Downloads-page controls. Main-process `gameById` is for installed games; synthetic entries must not go through metadata/favorite/choose-root actions assuming an installed folder exists. Keep backend validation even when UI controls are absent.

On import success, the backend emits `imported`, triggers a library scan, and also emits changed job snapshots. Those events can reach the renderer in different orders. Reconcile pending-to-installed identity without a transient Play-enabled synthetic card, missing selected card, duplicate dot, soundtrack change, or focus drop. If selected, migrate selection/focus to the real local ID once verified. Existing installations should remain usable while an unrelated job fails or updates.

### Removing Downloads without removing download capability

Remove the page, its nav/utility entry, and dead view routing; keep the manager, history persistence, IPC, popup/download context validation, and startup snapshot subscription. Preserve pause/resume/cancel/retry/setup affordances in a suitable in-place status surface where supported, rather than silently losing them with `createDownloads()`. Archive import currently lives in that controller and its Catalogue iframe button; extract/rehome that function before deleting the page module. Preserve the catalogue-scoped metadata association and an appropriate general archive-import entry point.

Catalogue has its own fetch sequence, filters, page, and focus state. Patch matching card status without restarting requests, resetting search/pagination, or replacing a focused card on each byte event. Keep pending cards read-only as requested. Preserve the ordinary acquisition route for an uninstalled catalogue title with no pending job; otherwise disabling every uninstalled card would prevent starting its first download. Distinguish this acquisition route from opening/launching an already pending game.

Subscribe before resolving the startup history snapshot, or version the responses, so a late initial snapshot cannot overwrite a newer progress event. Throttle presentation and status announcements without dropping completion/failure changes. No progress update should reconstruct the carousel or reset a 29-second dot to zero.

### Logo scope

The new mark is an artistic requirement, not a pattern supported by the carousel sources. Review it at small native taskbar/icon sizes as well as in the header. Verify shared shape/color across transparent mark, tile/favicon, generated PNG/ICO, packaged executable, and desktop shortcut. A renderer-only logo replacement is incomplete if the requested app logo remains old in Windows. Preserve the brand's accessible home label and treat decorative logo imagery appropriately. No claim about recognizability or brand improvement is established without user feedback.

### Acceptance probes for the new scope

- [ ] Advance a fake/injected clock through 29 seconds, hover for ten seconds, leave, and advance one more second: exactly one automatic advance. Confirm graphic and clock agree. Repeat with focus plus explicit Start, dialog, hidden page, reduced motion, a rescan, and a job progress update. No reset during passive interruptions; deliberate selection restarts at zero.
- [ ] Pause at 29.9 seconds, resume, then rapidly switch dots: no duplicate advancement or stale countdown fill. Exercise zero/one/two/many entries and adding/removing a pending entry while focused on its dot.
- [ ] Instrument Audio objects and effective gains during A-to-B-to-C rapid switching, late play promises/errors, mute/zero-volume changes, navigation away, wheel pause, launch, and disposal. Old tracks reach silence and are cleaned up; no stale fade touches the latest track; user volume/mute preferences remain unchanged.
- [ ] Start music, wheel to another game, allow several automatic cycles and progress events, then press rotation Start: still silent. Explicit music Play resumes; deliberate dot/cover/keyboard selection follows the documented resume policy while respecting mute. Wheel at the first/last entry and in a one-game collection also follows the agreed pause policy.
- [ ] Exercise mouse notches, high-resolution deltas, long momentum, direction reversal, diagonal/horizontal input, pixel/line/page modes, Ctrl+wheel, scrollable overlay text, volume controls, and dot overflow. Count selected IDs, audio state changes, and event/default-scroll effects. Exactly one agreed snap per recognized gesture/notch, with no free-floating intermediate resting position.
- [ ] Send snapshots through every download/import state, including unknown total, restart-interrupted, unsupported/multipart, failed extraction, needs-executable, missing installed folder, and saved executable completion. No launch/open IPC occurs from an uninstalled entry; status remains reachable and understandable.
- [ ] Import completion events before/after the library scan, two attempts for one PlayZip game, same-name different IDs, same Steam ID on another platform, a library-root change, and stale startup snapshot after a live event: no duplicate entry, premature Play, discarded update, or lost selected-dot focus.
- [ ] Remove the Downloads page while verifying Catalogue pagination/search focus, ongoing transfer controls, general/scoped archive import, main-process validation, persistent history, and completion announcements. Assert no download snapshot replaces the carousel/dot DOM or resets its elapsed clock.
- [ ] Inspect logo assets at 16/24/32 pixels, in-app and installed Windows surfaces. Recheck status contrast, 200% text, focus visibility, reduced motion, and native caption clearance after adding countdown and download-status overlays.

New-scope verdict: plan reviewed with the risks above; implementation acceptance pending. Previous functional acceptance remains applicable only to the earlier hero-and-dot snapshot.

## New-scope implementation review

Reviewed current carousel, main integration, audio controller, download presentation, Catalogue, hero CSS, and logo SVGs. Production-renderer probes used the supplied `index-BTXTwrgO.js` bundle with a private profile, synthetic installed/download fixtures, muted output, and no real launches or downloads. Source-level audio/identity probes imported the current modules separately. Only this document changed in the repository; no build or installation was performed by this reviewer.

### P2: Pending-to-installed migration resets the countdown

Location: `src/main.js`, `load()`/`acceptDownloads()` selected-ID migration and the `initialElapsed` condition in `render()`.

Progress-only job updates correctly patch the existing pending region without replacing the focused dot. However, when a pending entry becomes a verified installed game, its presentation ID changes from `download-<job ID>` to the real installed ID. `render()` preserves elapsed time only when `timing.selectedId === selectedId`, so this logical identity migration resets the countdown even though the user did not choose another game.

Independent reproduction used one installed fixture and one pending fixture. Start the pending slide's countdown, let it accumulate approximately 1.5 seconds, then focus its current dot. Before update: fill approximately `4.94%`, timer text `Automatic browsing paused with 29 seconds remaining.` Send a progress snapshot: the same dot stays focused and progress changes to 55. Then report the corresponding installed game in the library. Focus correctly migrates to `carousel-dot-2222222222222222`, but fill becomes `0` and timer text returns to `30 seconds remaining`.

Carry a logical-ID migration map or explicitly transfer the old selected entry's elapsed dwell when the job resolves to that installed game. Keep a genuine manual selection reset distinct. Verify the same case near the end of the 30-second period, while paused and while running. A new game chosen after the pending job is cancelled need not inherit elapsed time; this finding concerns the same selected game becoming installed.

### P2: A stale ready job creates a blocked acquisition with no recovery

Location: `src/downloads.js`, `pendingDownloads()`, ready-state label and `downloadActions()`; `src/catalogue.js`, pending strip and card suppression.

When history says `ready` but the corresponding game is no longer in the current library, the job is correctly prevented from enabling Play. It is instead shown indefinitely as `Finishing installation`. The matching catalogue card is hidden and disabled. Because ready is neither a live transfer nor a queued/failed/interrupted state, no pause, cancel, retry, or other recovery action is offered.

Independent reproduction: start with a verified installed game and its ready job, then remove that installed entry from the library while retaining the historical ready snapshot and its folder/gameId fields. Observed `MISSING_INSTALL_READY_JOB {"label":"Finishing installation","cardHidden":true,"cardDisabled":true,"recoveryActions":0}`. This models an installation removed outside Orbit or a stale restored job history, not an import that is merely waiting a moment for its first scan. A general archive picker is still available, but the normal catalogue acquisition path for this title is blocked by stale history.

Reconcile terminal history against the actual current library and surface a truthful unavailable/needs-attention state when installation cannot be verified. Provide an intentional recovery path, such as revalidated archive retry where supported, dismissing stale history, or reacquisition under the agreed product policy. Preserve the prohibition on launching/opening an uninstalled game. Do not label absent installed content as actively finishing forever. Backend retry currently accepts only appropriate failed/interrupted completed archives, so adding a renderer Retry label alone is insufficient.

### Independently passing observations

- Progress updates retain the exact pending dot and its focus while updating progress in place.
- Pending-to-installed migration chooses the real installed identity, transfers dot focus, removes the pending duplicate, and enables only the real game's route. The separate timing reset above remains.
- Same-name jobs with different catalogue IDs remain distinct; a name-only installed match does not falsely resolve a pending job.
- An audio probe ran A-to-B-to-C, delivered an error from a retiring voice, disposed while C's play promise was pending, then resolved that late promise. All voices ended paused/unloaded, no fade timer survived, and saved mute/volume stayed unchanged. No stale-callback defect was found in that path.
- Source inspection confirms the distinct wheel reason and persistent `musicEngaged = false` path, the removed Downloads route/icon, guarded startup snapshot revision, and sequence protection on library loads. These are code observations, not a substitute for real wheel/trackpad checks or actual audio listening.
- The logo mark and tile use the same open O/satellite construction. The generated PNG was visually inspected and matches the updated tile. Windows executable and desktop-shortcut refresh remain outside this review's verified scope.

### Remaining evidence limits

The implementation owner's 44 passing tests and expanded 30-second harness are supporting evidence for their asserted paths. This review did not rerun a full real-time dwell cycle or certify sound quality. The independent pending-timer probe checked real elapsed preservation around updates; it did not replace those timing tests. A scripted wheel burst also cannot establish every physical notch or momentum behavior. Continue to test those with actual input before release.

Countdown state is named and exposed without a live announcement every frame, and dot selectors retain native button semantics. Keep pending/download state announcements bounded to phase changes. The optional legacy volume slider has been removed from the current renderer; independent mute remains, so its absence alone is not a demonstrated audio-control accessibility failure. Do not claim preservation of every old music control if reporting that change.

New-scope verdict: acceptance withheld for the two reproduced P2 findings above. No additional concrete defect was found in the targeted stale-audio or same-name identity probes. All prior review scope limits still apply.

## Follow-up: elapsed migration fix, stale history, and local-archive identity

Reviewed the latest source updates without rebuilding. `render()` now derives `sameTimedGame` from the old pending job's resolution to the new installed ID. That is the appropriate source-level fix for preserving elapsed dwell across logical identity migration. The current built bundle still predates those source changes at this review point; runtime closure of that timing finding is pending a rebuild/probe.

For an unverified historical ready job, the status now reads `Not in library`, removes the indeterminate progress bar, and suggests rescanning or importing the archive again. This closes the false ongoing-installation label. The matching catalogue acquisition card remains hidden/disabled and the job has no direct recovery action. The general archive picker exists, but it imports without the old job's catalogue metadata. Depending on the archive filename/destination, that import may not resolve the stale job's PlayZip identity or historical folder. A job-scoped reimport could preserve that identity; a deliberate stale-history/reacquisition route is another option. Keep the installed/open prohibition intact. Do not report the recovery limitation as fully closed solely from the text change.

### New P2: General archives collide on the sentinel `local` identity

Locations: `src/downloads.js`, `installedDownload()` and `pendingDownloads()`, in combination with the existing general-import metadata in `electron/downloads.cjs` and manifest in `electron/importer.cjs`.

General archive import without a catalogue game supplies `game.id: 'local'`. The importer currently writes that value as `playzipId` into the resulting manifest. The new presentation code treats any truthy `job.game.id` as a catalogue identity and deduplicates it. It also matches any equal installed `playzipId`, without checking that it is an actual numeric catalogue ID.

Independent source-module probe:

- Jobs `job-a`/`Archive A` and `job-b`/`Archive B`, both with `game.id: 'local'`, yield only `Archive B` from `pendingDownloads([a,b],[])`.
- `installedDownload(jobB,[{id:'installed-a',name:'Archive A',folder:'D:/Games/Archive A',playzipId:'local'}])` returns that unrelated installed Archive A.

Thus two unrelated general imports collapse into one pending card, and one installed general archive can hide a different active general import completely. It can also cause pending selection to migrate to the wrong installed game. This is not a same-name ambiguity; the fixture names and job IDs differ. The earlier same-name/different-numeric-ID probe still passes but does not cover this sentinel.

Restrict PlayZip identity matching/deduplication to valid catalogue IDs. For general archives, use job identity while pending and verified `gameId`/folder identity after import; do not treat the sentinel `local` or a shared title as proof of equivalence. Account for already persisted manifests containing `playzipId: 'local'` rather than fixing only future imports. Add fixtures for concurrent general archives with distinct names, same names, one already installed local archive plus another queued import, and a general-archive reimport used to recover a stale catalogue job.

Follow-up verdict: elapsed migration appears fixed in source and needs runtime confirmation; misleading ready-state wording is fixed. General-archive identity and a usable stale-history recovery route remain unresolved. Only this review document was changed; the identity probe ran from a temporary file outside the repository.

## Rebuilt follow-up: new-scope findings closed

Independently re-probed production bundle `index-tqtxRc9u.js`, built 22 October 2026, using the private-profile renderer fixture and current source-module identity probe. Reviewed the corresponding Catalogue recovery callbacks and importer manifest changes. No source edits, rebuilds, installs, packaging, or real imports/downloads were performed by this reviewer.

### Elapsed migration verified

Before a progress update and installation migration, the selected pending game's fill was `4.944333333333333` percent and its paused timer had 29 seconds remaining. Progress changed to 55 with the exact dot retained. After the corresponding installed game appeared, the selected ID and focused dot migrated to the real installed ID while fill remained exactly `4.944333333333333` and the timer still reported 29 seconds. The countdown-reset finding is closed in the rebuilt renderer.

### Stale-history recovery verified

An absent installed game with a historical ready job now displays `Not in library`, keeps its normal acquisition card hidden/disabled, and offers one explicit recovery action. Activating `Import archive` through that status surface sent the original scoped metadata to mocked `add-archive` IPC: `{"id":"42","name":"Pending fixture","url":"https://playzip.com/game/42"}`.

This supplies the previously missing direct reimport route without enabling Play/open for the absent installation, and preserves catalogue identity instead of forcing a metadata-free general import. The stale-ready recovery finding is closed. Source inspection also confirms the separate `Download again` route for restart-interrupted, incomplete catalogue transfers; this review did not make a real acquisition request or run the OS archive picker.

### General-archive identity verified

The same independent local-archive fixtures now produce `LOCAL_ARCHIVE_PENDING ["Archive B","Archive A"]`. Matching Archive B against an unrelated installed Archive A whose persisted manifest contains `playzipId: 'local'` returns `undefined`. Both previously failing identity paths are closed.

Source inspection confirms that presentation matching/deduplication accepts valid positive safe numeric catalogue IDs, uses job identity for unassociated archives, and continues to match verified imported game IDs/folders. Future importer manifests store `null` rather than the noncatalogue `local` sentinel as `playzipId`. The legacy-manifest probe confirms the fix does not rely only on future manifest changes.

### Verdict and scope

Accepted for the reviewed design and targeted functional paths. No remaining concrete blocker was found in this rebuilt snapshot. The prior stale-audio/disposal and different-numeric-ID identity probes remain passing evidence within their described scope; the implementation owner's 45 tests and real-time countdown harness supply additional assertions that this reviewer has not independently rerun in full.

The implementation owner still needs to finish installed executable/icon/shortcut verification and any planned actual input/audio checks. This acceptance does not certify every trackpad gesture, subjective fade quality, screen-reader combination, contrast composition, or Windows scaling setting. Historical open statuses earlier in this document are superseded by this dated closure, not silently erased.

Only `docs/carousel-review.md` changed. Temporary probes used mocked archive/launch actions and did not modify application source or the old checkout.
