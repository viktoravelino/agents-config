The short version: your skills layer is mature, but it barely touches what T3 Code itself offers. Almost all of the wins below come from letting T3 own the mechanics your skills currently hand-roll, and from wiring the two layers together.

**What I found locally**

| Signal | Value |
|---|---|
| T3 threads total | 381 |
| Threads that used a T3 worktree | 4 |
| Threads in Full Access mode | 381 |
| Projects with a `t3.json` | 1 of 15 (t3code itself) |
| Claude Code hooks configured | 0 |
| T3 state database size | 2.3 GB |

Every skill (validate-ticket, work-ticket, git-worktree, dev-servers, langflow) manages worktrees, env copying, and dev servers by hand. T3 has native worktrees per thread, a `runOnWorktreeCreate` setup script, storage cleanup policies, and a `previewUrl` that opens the in-app browser. You are not using any of it for Langflow.

**Highest-value ideas, in order**

1. **Give Langflow a `t3.json`.** Set `defaultThreadEnvMode: "worktree"`, one setup script that copies `.env` from `$T3CODE_PROJECT_ROOT` and warms deps, and a "Start stack" script that runs your Docker compose from the langflow skill with `previewUrl` pointing at the frontend port. Then the agent gets `preview_*` tools against a live stack with zero prose in the skill. This also makes your git-worktree skill's sibling-directory convention mostly redundant for T3 threads.

2. **Teach the skills to detect T3.** When `T3CODE_WORKTREE_PATH` is set, validate-ticket and work-ticket should reuse the thread's worktree instead of creating `../langflow-LE-123`. Today a T3 worktree thread running validate-ticket would produce a second worktree for the same ticket.

3. **Make file-pr call `link_pull_request`.** T3 tracks linked PRs, shows checks, and can auto-settle the thread on merge. Your skill never links, so 25 PRs got tracked only when a system reminder nudged the agent. Add one line to the skill and flip on "auto-settle on merge" in T3 settings.

4. **Turn on storage cleanup for worktrees.** You have "delete worktree when thread is deleted" on, but the inactive-days and after-merge policies are off. With idea 1 you will create many more worktrees, and this keeps the two stale Langflow worktrees from becoming ten. Pair it with the Docker `down -v` rule from the langflow profile so volumes do not outlive the worktree.

5. **Stop running everything in Full Access.** Reviews, validation, standup, and "what do you think" threads never need write access. Set a per-project default of Auto-accept edits and pick Full Access per thread when you actually want commands to run unattended. This is a one-time settings change.

6. **Add three Claude Code hooks in the shared settings.** You have none. The ones that pay off: a PreToolUse guard that blocks `gh pr merge` and `--auto` (your hard rule, currently enforced only by prose), a PostToolUse formatter after edits in Langflow, and a Stop hook that posts a desktop notification so you can turn T3 notifications off and still know when a thread finishes. The update-config skill can write them.

**Smaller cleanups**

- The `mod+a` keybinding points at a script id `asdas` that does not exist. Rebind it to a real script, such as the Langflow stack starter, once `t3.json` exists.
- Skills are hidden from the `/` menu (`showSkillsInSlashMenu` is off). Turning it on gives you `$validate-ticket` autocomplete in the composer instead of typing it.
- The state database is 2.3 GB for 381 threads. Deleting or archiving old settled threads, then vacuuming, is worth trying before it slows the sidebar.
- The `claude/` and `codex/` folders in agents-config are empty. Either populate them with provider-specific bits, such as the hooks above for Claude, or remove them so the README's mental model stays honest.
- Shared settings still pin `opus[1m]` as the CLI model while T3 defaults Langflow to Opus 5 and everything else to whatever was last picked. Decide one default and set it in both places.
- Your prompt-title and branch-name generation runs on Sonnet 5, which is right. Keep it.

**Bolder ideas**

- **Move project profiles into `t3.json` plus a per-project skill.** Ports, start commands, and hazards are exactly what `t3.json` scripts encode. The langflow skill would shrink to review guidance, branch rules, and the Jira mapping.
- **Fan out with shift-click, not subagents.** T3 lets one prompt spawn one thread per model, each in its own worktree. For adversarial review you could run Claude and Codex on the same diff in parallel and compare, which your adversarial-review skill currently simulates with a single agent.
- **A `t3.json` template in agents-config.** Since fourteen projects have none, a script that drops a starter file with the env-copy setup script would make every new project worktree-ready in one command.

If you want to start anywhere, ideas 1 through 3 are one afternoon and change the daily Langflow loop the most.