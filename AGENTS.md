<!-- BEGIN LLP INIT MANAGED BLOCK -->
# Agent Instructions

This project uses **Linked Literate Programming (LLP)**. Read LLP 0000 before making substantial changes.

## LLP documents

- LLP documents live in `llp/` and follow the numbering convention `NNNN-slug.type.md` (e.g. `0001-foo.guide.md`, `0003-bar.research.md`).
- When creating a new LLP, use the next available number and include the standard metadata header (`Type`, `Status`, `Systems`, `Author`, `Date`; optional `Role`, `Revised`, `Related`).
- Standard types: **RFC**, **Spec**, **Decision**, **Plan**, **Explainer**, **Principle**, **Guide**, **Issue**, **Research**. You may define others if none of these fit.
- RFCs (and optionally Specs/Plans) commonly use the expanded lifecycle: `Draft` -> `Review` -> `Accepted` -> `Active`.
- LLP documents are living documents. Update them when the system evolves. If an LLP is historical but still useful, move it under `llp/tombstones/` and mark it `Tombstoned`. Don't leave stale docs around unmarked.

## @ref annotations

- When writing or modifying code that implements a non-obvious design decision documented in an LLP, add an `@ref` annotation: `// @ref LLP NNNN#section — short gloss`
- When modifying code that already carries a `@ref`, check that the referenced section still applies. Update or remove it if not.
- Don't annotate mechanically. A reference should tell you something you wouldn't know from reading only the code and filename.

## Working on this project

- Read relevant LLP documents before implementing features or fixing bugs in the areas they cover.
- If you make a design decision worth documenting, write or update an LLP for it.
- Prefer updating an existing LLP over creating a new one when the topic is already covered.
<!-- END LLP INIT MANAGED BLOCK -->

## 82-0-chrome-ext specifics

- Start at **[LLP 0000](./llp/0000-82-0-chrome-ext.explainer.md)** — the root explainer for this project and a short guide to how LLP is used here.
- This is a **Chrome Manifest V3 extension.** Pay special attention to LLPs covering manifest permissions, the (ephemeral) service-worker lifecycle, content-script injection, and content-script ↔ service-worker ↔ popup messaging — those are the areas where plausible-looking code most often violates a global constraint. See [LLP 0000 → "What's worth a `@ref` in a Chrome extension"](./llp/0000-82-0-chrome-ext.explainer.md#whats-worth-a-ref-in-a-chrome-extension).
- The LLP conventions are adopted from **https://github.com/ccheever/llp**, but that repo is **not vendored** here (no git submodule). Only the documents in this repo's `llp/` directory are authoritative for this project.
