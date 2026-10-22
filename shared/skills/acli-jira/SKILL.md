---
name: acli-jira
description: Use acli to manage Jira tickets from the command line -- search, view, create, edit, transition, assign, comment, link, and more.
argument-hint: "[ticket key or what to do]"
---

## Purpose

Use this skill when you work with Jira. It covers reading tickets, creating new tickets, updating existing ones, searching with JQL, changing status, assigning, commenting, linking, and browsing projects and boards. `acli jira` manages Jira Cloud from the CLI.

**Before you create or change tickets, read [`boards.md`](boards.md) next to this file, if it exists.** It holds the conventions for the boards in use (project key, types, labels, statuses, custom fields). Git ignores it, and it stays local.

## When to use what

- `acli jira workitem view`: Read one ticket by key (positional). Use it for details, parent, links, or any field.
- `acli jira workitem search`: Find tickets with JQL. Use it for any search, filter, or list.
- `acli jira workitem create`: Create a ticket.
- `acli jira workitem edit`: Change summary, description, labels, type, or assignee.
- `acli jira workitem transition`: Move a ticket to a new status.
- `acli jira workitem assign`: Change or remove the assignee.
- `acli jira workitem comment create|list|update|delete`: Manage comments.
- `acli jira workitem link create|list|type|delete`: Manage links between tickets.
- `acli jira workitem attachment list|delete`: List or delete attachments. acli cannot upload.
- `acli jira workitem clone`: Duplicate tickets. You can put the copies in another project.
- `acli jira project list|view`: Find projects and their issue types.
- `acli jira board search|view|list-sprints`: Find boards. Only scrum boards have sprints.
- `acli jira sprint list-workitems`: List the tickets in a sprint. It needs `--sprint` and `--board`.

## Core concepts

- **Use `--json` on reads** (`view`, `search`, `comment list`, `link list`, `project list`, ...).
- **Use `--yes` on bulk-capable mutations** (`edit`, `transition`, `assign`, `clone`, `link create`) so they do not wait for a prompt. `create` and `comment create` have no `--yes` flag.
- **Keys**: `view` takes the key as a positional argument. Every other command takes `--key`, and most accept a comma-separated list (`--key "PROJ-1,PROJ-2"`). `comment list` and `link list` take exactly one `--key`.
- **Bulk targets**: `edit`, `transition`, `assign`, `clone`, and `comment create` also accept `--jql` or `--filter` instead of `--key`. These are dangerous. First confirm the match count with `search --count`.
- **`@me`** means the authenticated user in `--assignee`. `default` means the project's default assignee.
- **Labels**: `create` uses `--label`. `edit` uses `--labels` and `--remove-labels`. Both take a comma-separated list.
- **Ticket types** are specific to each project and are case-sensitive. Read them from `acli jira project view --key PROJ --json` (`issueTypes[].name`). Do not guess `Story` or `Sub-task`.
- **Descriptions and comment bodies** accept plain text or Atlassian Document Format (ADF). For multi-line text, use `--description-file` or `--body-file`. This avoids shell escaping.

## Known limits

These limits are verified against acli 1.3.36 and the current reference docs:

- **`search --fields` accepts only some fields.** These work: `key`, `issuetype`, `summary`, `status`, `assignee`, `priority`, `labels`, `reporter`. These fail with `field '<x>' is not allowed`: `parent`, `issuelinks`, `components`, `fixVersions`, `sprint`, `created`, `updated`. Filter on them in the JQL instead. Then `view` single tickets to get the values.
- **`view --fields` accepts any field**, plus `*all` and `*navigable`. Use `-field` to exclude a field. The default set does not include comments or links.
- **You can set custom fields only at creation**, with `create --from-json` and `additionalAttributes`. `edit --from-json` has no `additionalAttributes`, so acli cannot change custom fields.
- **`create` and `edit` have no flags** for priority, component, or fix version.
- **Sprints**: `board list-sprints` fails with "The board does not support sprints" on kanban and simple boards.

## Recommended workflow

1. **Read `boards.md`** for the project you work in. If there is no entry, find the project with `acli jira project list --recent --json` and `acli jira project view --key PROJ --json`.
2. **Search**: `acli jira workitem search --jql "project = PROJ AND ..." --json`.
3. **View**: `acli jira workitem view PROJ-123 --json`. Then read the comments and links to see the full picture.
4. **Create, edit, or transition** with the commands below.

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

Priority names are also specific to each project (`High/Highest` on some, `Critical/Major/Minor` on others).

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

Status names are specific to each project and are case-sensitive. If a transition fails, the error lists the valid names.

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

`comment update` also takes `--body-adf <json file>`, `--visibility-role`, `--visibility-group`, and `--notify` (off by default). The reference docs show `comment delete --issue`, but the real flag is `--key`.

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

- When you create a ticket and there is no `boards.md` entry, ask the user for the **project key**.
- Pick **labels** from the labels the project already uses (see `boards.md`, or search recent tickets). Do not invent new ones.
- For large result sets, use `--limit` or `--paginate`.
- If acli prints "You're using an outdated version", mention it once. The user decides whether to run `brew upgrade acli`.
