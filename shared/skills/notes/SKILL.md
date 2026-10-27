---
name: notes
description: Add a note to the owner's notes vault (~/notes), or answer from it. Use when the user asks to write a note, save or capture an idea, record a decision or a learning, says "anota isso", "cria uma nota" or "salva essa ideia", or asks what their notes say about something. The user writes in Portuguese and English.
---

# Notes

The owner keeps notes in an Obsidian vault at `~/notes`. It is a git repo. The vault rules are in `~/notes/CLAUDE.md`, the single source of truth. Do not copy them here.

## Add a note

1. Read `~/notes/CLAUDE.md`. Follow its rules for layout, properties, names and secrets.
2. Run `git -C ~/notes pull --rebase`.
3. Pick the folder from the Layout section of `~/notes/CLAUDE.md`. If it is not clear, use `inbox/`.
4. Write the note in the user's language, with the properties that the vault rules require.
5. Commit only the files you touched, with a short message. Then run `git -C ~/notes push`.
6. Reply with the path of the note.

If the pull or push fails, stop and report the error. Never force-push.

## Answer from the notes

When the user asks what the notes say about a topic, search `~/notes` with `rg` or `grep`. Answer from what you find and name the notes. Do not edit anything.
