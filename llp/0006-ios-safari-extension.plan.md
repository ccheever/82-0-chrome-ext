# LLP 0006: iOS Safari Extension Packaging

**Type:** Plan
**Status:** Active
**Systems:** Manifest, Content, UI, Distribution
**Author:** Charlie Cheever / Codex
**Date:** 2026-06-06
**Revised:** 2026-06-06
**Related:** [LLP 0000](./0000-82-0-chrome-ext.explainer.md), [LLP 0002](./0002-extension-product.spec.md), [Safari Extensions](https://developer.apple.com/safari/extensions/), [Packaging & distributing Safari Web Extensions with App Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect), [Expo EAS internal distribution](https://docs.expo.dev/build/internal-distribution/), [Expo EAS iOS app extensions](https://docs.expo.dev/build-reference/app-extensions/)

## Goal

Make **82-0 Coach** usable from an iPhone running Mobile Safari.

The existing product is a no-build Manifest V3 Chrome extension. On iOS, Safari
does not install a raw extension directory from the browser. A Safari Web Extension
must be packaged inside an iOS app container, then enabled in Safari. The build
therefore needs to produce:

- an iOS Safari Web Extension Xcode project for local device/simulator testing
- a web-extension ZIP that can be uploaded to App Store Connect's Safari Web
  Extension Packager for TestFlight/App Store distribution

## Distribution Paths

### Local Device Testing

Use Xcode's Safari web extension packager to create an iOS app wrapper around the
existing extension files.

The resulting app can be installed on a development iPhone by opening the Xcode
project, selecting the iOS app scheme, selecting the device, and running the app.
After installation, the user enables the extension in Safari's extension settings
and grants it access to `82-0.com`.

This is the fastest path for development, but it is not a phone-only install: the
phone needs to be connected to Xcode for deployment.

### Phone-Originated Install

A true "install it from my phone" flow requires TestFlight or App Store
distribution. Apple's [Packaging and distributing Safari Web Extensions with App
Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)
feature takes a **ZIP of the web-extension resources** uploaded directly to App Store
Connect and packages it into a distributable app — **with no Mac or Xcode required**.
Once the build is processed, open the TestFlight link on the iPhone and install from
the phone itself.

This path needs Apple Developer Program access and App Store Connect setup, but not the
local Xcode toolchain — the Xcode project below is only for local device/simulator
testing.

### Mobile Safari Bookmarklet Trial

For quick iPhone testing before Apple signing is configured, the coach can also be
packaged as a bookmarklet. This is not a Safari extension install and should not
replace the Xcode/TestFlight paths, but it is useful when the user is already on
the phone and wants to try the advisory overlay immediately.

The bookmarklet inlines the coach scripts and CSS, so it can run on the HTTPS
`82-0.com` page without loading insecure local-network scripts. Because there is no
WebExtension runtime in a bookmarklet, bundled `players.json` is unavailable and
the coach falls back to visible card stats. That makes the bookmarklet best for
Classic mode; HoopIQ hides stats and needs the real extension packaging path.

Bookmarklets run in the page's own context, so a strict Content-Security-Policy on
`82-0.com` could block the injected `<style>` or inline code and leave the overlay
unstyled or inert. The extension paths run in an isolated world that is exempt from
page CSP, so they stay the reliable option; treat the bookmarklet as best-effort.

### EAS Services Evaluation

Expo EAS can create iOS internal-distribution builds with shareable install URLs,
and EAS can handle app-extension credentials for bare projects. That sounds close
to the desired "install from my phone" flow, but it does **not** remove Apple's
signing rules:

- iOS internal EAS builds still use ad hoc or enterprise provisioning, and ad hoc
  builds only install on registered device UDIDs.
- EAS needs Apple Developer credentials, App Store Connect credentials, or
  previously configured EAS-managed credentials to create the provisioning profile.
- This repo is not an Expo or React Native app. EAS could be made to build a bare
  Xcode project or a custom build, but that would be extra packaging infrastructure
  around the Safari wrapper, not a shortcut around signing.

For this project, EAS is useful only after Apple credentials are available and if a
shareable ad hoc URL is preferred over Apple's Safari Web Extension Packager /
TestFlight path. Until then, the bookmarklet is the only no-signing iPhone trial
path.

## Implementation Plan

1. Keep the extension's source of truth in the existing no-build files:
   `manifest.json`, `src/lib/*`, `src/content.js`, `src/overlay.css`, and
   `src/data/players.json`.
2. Add WebExtension runtime compatibility in the content script so bundled data can
   be loaded through either `chrome.runtime.getURL` or `browser.runtime.getURL`.
3. Add narrow-viewport overlay CSS so the advisory panel fits Mobile Safari without
   hiding too much of the board.
4. Add extension icon PNGs to the manifest so the Safari packager can populate the
   generated iOS project and App Store/TestFlight metadata without placeholder icon
   warnings.
5. Add a packaging script that:
   - stages only the extension resources needed by Safari
   - writes a ZIP suitable for App Store Connect's Safari Web Extension Packager
   - generates an iOS-only Xcode wrapper with `xcrun safari-web-extension-packager`
   - post-processes generated bundle identifiers when needed
6. Generate the first iOS wrapper project under `platforms/`.

## Build Outputs

The repeatable entry point is `scripts/package-safari-ios.sh`.

For the bookmarklet trial path, the repeatable entry point is
`scripts/build-mobile-bookmarklet.mjs`.

The script creates:

- `dist/safari-web-extension/` — ignored staging directory containing only the
  extension resources
- `dist/82-0-coach-safari-web-extension.zip` — ignored upload artifact for App
  Store Connect's Safari Web Extension Packager
- `platforms/82-0 Coach/82-0 Coach.xcodeproj` — generated iOS wrapper project for
  Xcode local device/simulator installs
- `dist/82-0-coach-mobile-bookmarklet.html` — ignored phone-friendly page for
  copying the bookmarklet into Mobile Safari
- `dist/82-0-coach-mobile-bookmarklet.txt` — ignored raw `javascript:` bookmarklet

The generated Xcode project copies the staged resources. The repo source of truth
remains the root extension files and the packaging script. After changing extension
logic, rerun the script before building the iOS wrapper.

### Version Control

`dist/` is git-ignored, and **`platforms/` is treated the same way — a regenerable
build artifact, not committed source.** Two reasons:

- The packager runs with `--copy-resources`, so the generated project embeds *copies* of
  every extension file, including the 1.4 MB `players.json`. Committing it duplicates the
  dataset and produces a large, churny diff on every regeneration.
- Those copies drift: edit `src/` and forget to rerun, and the committed wrapper silently
  builds stale code — exactly the "wrapper becomes a second source of truth" failure the
  [Review Checklist](#review-checklist) warns against.

Neither distribution path needs the committed Xcode project — the phone path uploads the
ZIP to App Store Connect, and local testing regenerates `platforms/` from the root files
via the script — so it stays git-ignored. If a future change hand-customizes the generated
Swift wrapper (e.g. an enable-in-Safari landing screen), commit only those specific files
and revisit this policy.

## Install Steps

For local device testing:

1. Run `FORCE=1 scripts/package-safari-ios.sh` after any extension source change.
2. Open `platforms/82-0 Coach/82-0 Coach.xcodeproj` in Xcode.
3. Select the `82-0 Coach` scheme and the connected iPhone.
4. In Signing & Capabilities, choose a development team if Xcode asks for one.
5. Run the app on the iPhone.
6. On the iPhone, enable the extension in Safari extension settings and grant it
   access to `82-0.com`.

Observed from SSH on 2026-06-06: the Mac could see the iPhone as a paired
local-network device with Developer Mode enabled and app-install capability, but
device builds failed because Xcode was not signed into the installed Apple
Development teams and had no provisioning profiles for either bundle identifier:

- `com.ccheever.eightytwozero.coach`
- `com.ccheever.eightytwozero.coach.Extension`

The fix is signing/account setup, not code: open Xcode's Accounts settings on the
Mac, sign into the Apple Developer account for the intended team, then rerun the
device build or run from Xcode.

For phone-originated install:

1. Upload `dist/82-0-coach-safari-web-extension.zip` through App Store Connect's
   Safari Web Extension Packager.
2. Configure the resulting app for TestFlight distribution.
3. Open the TestFlight invitation on the iPhone, install the app, then enable the
   Safari extension and grant access to `82-0.com`.

For the bookmarklet trial:

1. Run `scripts/build-mobile-bookmarklet.mjs`.
2. Serve `dist/` from the Mac on a LAN-reachable port, for example
   `python3 -m http.server 8765 --bind 0.0.0.0 --directory dist`.
3. Open `http://<mac-lan-ip>:8765/82-0-coach-mobile-bookmarklet.html` on the
   iPhone.
4. Copy the bookmarklet, create/edit a Safari bookmark with that `javascript:`
   URL, open `https://82-0.com`, start Classic mode, then run the bookmark.

## WebExtension API Compatibility

Chrome exposes `chrome.runtime.getURL`. Safari Web Extensions commonly expose the
standard `browser.runtime.getURL` API, while compatibility with `chrome.*` can vary
by API and Safari version. The content script should use a small local helper that
selects either namespace and fails visibly if no WebExtension runtime exists.

The rest of the first-release extension is already portable because it does not use
a background worker, popup, `chrome.storage`, `tabs`, `scripting`, or extension
messaging.

## Mobile Overlay Constraints

The desktop overlay is a fixed 320px panel in the lower-right corner. On iPhone, it
must avoid overflowing narrow screens and account for the bottom safe area. The
mobile CSS should:

- stretch between small left/right insets instead of using a fixed width
- cap height to less than half the viewport
- keep the collapse control available
- leave the board usable enough that the user can still tap the live game controls

The extension remains advisory-only on iPhone, matching LLP 0002. It should not add
autopilot, timer bypassing, app-state hooks, or new extension permissions as part
of the Safari port.

## Xcode Project Post-Processing

The Xcode 26.5 Safari packager derives part of the generated iOS app bundle
identifier from the app name. With the display name `82-0 Coach`, that produced a
parent app identifier ending in `.-2-0-Coach`, while the extension target used
`com.ccheever.eightytwozero.coach.Extension`. iOS requires an embedded extension's
bundle identifier to be prefixed by the parent app's bundle identifier.

The packaging script therefore rewrites the generated app target's
`PRODUCT_BUNDLE_IDENTIFIER` to `com.ccheever.eightytwozero.coach` and leaves the
extension target as `com.ccheever.eightytwozero.coach.Extension`. This keeps the
user-visible app name as `82-0 Coach` while satisfying iOS embedded-extension
validation.

## Review Checklist

- The generated wrapper must not become the source of truth for extension logic.
- The staging script must avoid copying repo-only material such as `.git`, LLPs, or
  simulation scripts into the Safari extension resources.
- Any new permissions or host matches must be justified in LLP 0002 or a new LLP.
- The phone-only install story must be described accurately: TestFlight/App Store,
  not raw Mobile Safari sideloading.
- The generated parent app bundle identifier must prefix the extension bundle
  identifier before declaring the iOS wrapper verified.

## Review Outcome

Reviewed and revised during implementation on 2026-06-06.

- The staging ZIP contains only `manifest.json`, `src/`, and `icons/`.
- The source content script uses `chrome.runtime.getURL` or
  `browser.runtime.getURL`.
- The mobile overlay CSS fits narrow Safari viewports and uses the bottom safe
  area.
- The generated iOS project builds for iOS Simulator with signing disabled.
- Physical iPhone installation still requires local Xcode signing/deployment or a
  TestFlight/App Store path; raw Mobile Safari installation is not supported.
- The bookmarklet trial path runs without Apple signing, but it is Classic-mode
  oriented because it cannot load the extension's bundled dataset.
- Physical device build was attempted from SSH against a paired iPhone and blocked
  only by missing Xcode account/provisioning profiles.
- EAS was evaluated and is not a signing bypass; it remains a possible future ad
  hoc distribution wrapper once Apple credentials are available.

### Independent review — 2026-06-06

Checked against the installed toolchain (Xcode 26.5) and current Apple docs:

- `safari-web-extension-packager` and `safari-web-extension-converter` are the **same
  tool** (byte-identical `--help`), so the script's use of the packager is correct.
- The generated bundle identifiers are correct — `com.ccheever.eightytwozero.coach` and
  `…coach.Extension` — satisfying the embedded-extension prefix rule.
- The **App Store Connect ZIP-upload path is a real Apple feature** and needs no Mac or
  Xcode, which is what makes the phone-only install genuinely phone-only.
- The bookmarklet boots correctly: `src/lib/*` and `content.js` are IIFEs that populate
  `globalThis.C820`, and `loadData()` already swallows the missing-runtime error and
  falls back to on-card stats.

Changed this pass:

- `platforms/` reclassified as a regenerable, git-ignored build artifact — see
  [Version Control](#version-control).
- Sharpened the distribution wording and added the App Store Connect packaging doc link.
- Noted that a strict page CSP can limit the bookmarklet.

Re-verified here: the generated project builds for iOS Simulator with signing
disabled. Physical device installation remains unverified until Apple account /
provisioning setup is completed.
