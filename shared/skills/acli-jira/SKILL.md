---
name: acli-jira
description: Use acli to manage Jira tickets -- search, view, create, edit, transition, assign, comment, link, and more from the command line.
argument-hint: "[ticket key or what to do]"
---

## Purpose

Use this skill when you need to interact with Jira: reading tickets, creating new work items, updating existing ones, searching with JQL, transitioning status, assigning, commenting, linking, or browsing projects and boards. `acli jira` provides Jira Cloud management from the CLI.

**Before creating or changing tickets, read [`boards.md`](boards.md) next to this file if it exists.** It holds the conventions for the boards actually in use (project key, types, labels, statuses, custom fields). It is gitignored and stays local.

## When to use what

- `acli jira workitem view`: Read one ticket by key (positional). Use for details, parent, links, any field.
- `acli jira workitem search`: Find tickets with JQL. Use for any search, filtering, or listing.
- `acli jira workitem create`: Create a ticket.
- `acli jira workitem edit`: Change summary, description, labels, type, or assignee.
- `acli jira workitem transition`: Move a ticket to a new status.
- `acli jira workitem assign`: Change or remove the assignee.
- `acli jira workitem comment create|list|update|delete`: Work with comments.
- `acli jira workitem link create|list|type|delete`: Work with links between tickets.
- `acli jira workitem attachment list|delete`: List or delete attachments (acli cannot upload).
- `acli jira workitem clone`: Duplicate tickets, optionally into another project.
- `acli jira project list|view`: Discover projects and their issue types.
- `acli jira board search|view|list-sprints`: Find boards; sprints exist only on scrum boards.
- `acli jira sprint list-workitems`: Tickets in a sprint (requires `--sprint` and `--board`).

## Core concepts

- **Use `--json` on reads** (`view`, `search`, `comment list`, `link list`, `project list`, ...).
- **Use `--yes` on bulk-capable mutations** (`edit`, `transition`, `assign`, `clone`, `link create`) so they never wait on a prompt. `create` and `comment create` have no `--yes` flag.
- **Keys**: `view` takes the key as a positional argument. Every other command takes `--key`, and most accept a comma-separated list (`--key "PROJ-1,PROJ-2"`). `comment list` and `link list` take exactly one `--key`.
- **Bulk targets**: `edit`, `transition`, `assign`, `clone`, and `comment create` also accept `--jql` or `--filter` instead of `--key`. Treat these as dangerous — confirm the match count with `search --count` first.
- **`@me`** means the authenticated user in `--assignee`; `default` means the project's default assignee.
- **Labels**: `create` uses `--label`, `edit` uses `--labels` / `--remove-labels`. Both are comma-separated.
- **Work item types** are project-specific and case-sensitive. Read them from `acli jira project view --key PROJ --json` (`issueTypes[].name`) rather than guessing `Story` or `Sub-task`.
- **Descriptions and comment bodies** accept plain text or Atlassian Document Format (ADF). Use `--description-file` / `--body-file` for anything multi-line to avoid shell escaping.

## Known limits

Verified against acli 1.3.36 and the current reference docs:

- **`search --fields` only accepts a subset of fields.** `key`, `issuetype`, `summary`, `status`, `assignee`, `priority`, `labels`, `reporter` work; `parent`, `issuelinks`, `components`, `fixVersions`, `sprint`, `created`, `updated` are rejected with `field '<x>' is not allowed`. Filter on those in the JQL instead, then `view` individual tickets for the values.
- **`view --fields` accepts any field**, plus `*all` and `*navigable`, and `-field` to exclude. The default set does not include comments or links.
- **Custom fields can only be set at creation**, via `create --from-json` with `additionalAttributes`. `edit --from-json` has no `additionalAttributes`, so custom fields cannot be changed with acli.
- **No priority, component, or fix-version flags** on `create` or `edit`.
- **Sprints**: `board list-sprints` fails with "The board does not support sprints" on kanban and simple boards.

## Recommended workflow

1. **Read `boards.md`** for the project you are working in. If there is none, discover with `acli jira project list --recent --json` and `acli jira project view --key PROJ --json`.
2. **Search**: `acli jira workitem search --jql "project = PROJ AND ..." --json`.
3. **View**: `acli jira workitem view PROJ-123 --json`, then comments and links for the full picture.
4. **Create/edit/transition** using the commands below.

## Common JQL patterns

```sh
# All open tickets in a project
--jql "project = PROJ AND status != Done"

# Tickets assigned to me
--jql "assignee = currentUser()"

# Bugs created this week
--jql "project = PROJ AND type = Bug AND created >= startOfWeek()"

# Tickets with a specific label
--jql "project = PROJ AND labels = backend"

# Search by summary text
--jql "project = PROJ AND summary ~ \"search term\""

# Children of an epic
--jql "parent = PROJ-100"

# Recently updated
--jql "project = PROJ AND updated >= -7d ORDER BY updated DESC"
```

Priority names are project-specific too (`High/Highest` on some, `Critical/Major/Minor` on others).

## Examples

### View a ticket

```sh
acli jira workitem view PROJ-123 --json

# Specific fields, including ones search cannot return
acli jira workitem view PROJ-123 --fields "summary,status,parent,issuelinks,labels" --json

# Everything
acli jira workitem view PROJ-123 --fields "*all" --json

# Open in the browser for the user
acli jira workitem view PROJ-123 --web
```

### Search for tickets

```sh
acli jira workitem search --jql "project = PROJ AND status = 'In Progress'" --json

# Chosen fields and a cap
acli jira workitem search --jql "project = PROJ AND assignee = currentUser()" \
  --fields "key,summary,status,priority,labels" --limit 20 --json

# Count only
acli jira workitem search --jql "project = PROJ AND type = Bug" --count

# Everything, paginated
acli jira workitem search --jql "project = PROJ" --paginate --json
```

### Create a ticket

```sh
# Basic
acli jira workitem create \
  --project "PROJ" \
  --type "Task" \
  --summary "Implement feature X" \
  --description-file /tmp/description.md \
  --label "backend,feature" \
  --assignee "@me" \
  --json

# Under an epic or parent
acli jira workitem create \
  --project "PROJ" \
  --type "Bug" \
  --summary "Fix login timeout" \
  --description "Users report timeout after 30s on the login page" \
  --parent "PROJ-100" \
  --json

# With custom fields: generate the template, fill it, create from it
acli jira workitem create --generate-json > /tmp/workitem.json
acli jira workitem create --from-json /tmp/workitem.json --json
```

The `--from-json` shape: `projectKey`, `type`, `summary`, `description` (ADF), `labels`, `assignee`, `parentIssueId`, and `additionalAttributes` (`{"customfield_10000": {"value": "..."}}` for select fields, a bare string or number otherwise).

### Edit a ticket

```sh
acli jira workitem edit --key "PROJ-123" --summary "Updated summary" --labels "backend,urgent" --yes --json
acli jira workitem edit --key "PROJ-123" --remove-labels "stale" --yes --json
acli jira workitem edit --key "PROJ-123" --description-file /tmp/description.md --yes --json
```

### Transition a ticket

```sh
acli jira workitem transition --key "PROJ-123" --status "In Progress" --yes --json
acli jira workitem transition --key "PROJ-1,PROJ-2" --status "Done" --yes --json
```

Status names are project-specific and case-sensitive. If a transition fails, the error lists the valid ones.

### Assign a ticket

```sh
acli jira workitem assign --key "PROJ-123" --assignee "@me" --yes --json
acli jira workitem assign --key "PROJ-123" --assignee "user@company.com" --yes --json
acli jira workitem assign --key "PROJ-123" --remove-assignee --yes --json
```

### Comments

```sh
acli jira workitem comment create --key "PROJ-123" --body "This is ready for review"
acli jira workitem comment create --key "PROJ-123" --body-file /tmp/comment.md

# Replace your own last comment instead of adding another
acli jira workitem comment create --key "PROJ-123" --body-file /tmp/comment.md --edit-last

acli jira workitem comment list --key "PROJ-123" --json

# Update or delete a specific comment: take its id from `comment list` (comments[].id)
acli jira workitem comment update --key "PROJ-123" --id 10001 --body-file /tmp/comment.md
acli jira workitem comment delete --key "PROJ-123" --id 10001
```

`comment update` also takes `--body-adf <json file>`, `--visibility-role` / `--visibility-group`, and `--notify` (off by default). The reference docs show `comment delete --issue`, but the real flag is `--key`.

### Links

```sh
acli jira workitem link list --key "PROJ-123" --json
acli jira workitem link type --json            # valid --type values
acli jira workitem link create --out "PROJ-123" --in "PROJ-456" --type "Blocks" --yes
```

### Projects and boards

```sh
acli jira project list --recent --json
acli jira project view --key "PROJ" --json

acli jira board search --name "My Team" --json      # also --project PROJ, --type scrum|kanban|simple
acli jira board view --id 42 --json
acli jira board list-sprints --id 42 --state active --json   # scrum boards only
acli jira sprint list-workitems --sprint 101 --board 42 --json
```

## Important tips

- When creating tickets without a `boards.md` entry, ask the user for the **project key**.
- Pick **labels** from the ones the project already uses (see `boards.md`, or search recent tickets) rather than inventing new ones.
- For large result sets, use `--limit` or `--paginate`.
- If acli prints "You're using an outdated version", mention it once; `brew upgrade acli` is the user's call.
