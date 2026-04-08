PROJECT RESOLUTION: Determine the current project name from the working directory's repo name (e.g., if cwd is inside `langflow` or `langflow-wxo-fe`, project = "langflow"; if `anima-virtus`, project = "anima-virtus"). Use this as <PROJECT> below. The vault base is "/Users/viktoravelino/Documents/Obsidian Vault".

Check the last-updated date in "<vault>/projects/<PROJECT>/github-history.md"

REPO RESOLUTION: Run `gh repo view --json nameWithOwner -q .nameWithOwner` from the current working directory to get the OWNER/REPO. Use `--repo OWNER/REPO` on all `gh` commands below to scope queries to this repo only.

Then pull only NEW activity since that date:

gh pr list --repo <OWNER/REPO> --state merged --author @me --json number,title,labels,mergedAt,url,additions,deletions --jq '[.[] | select(.mergedAt > "YYYY-MM-DDT00:00:00Z")]'

gh issue list --repo <OWNER/REPO> --state all --author @me --json number,title,labels,closedAt,state,url --jq '[.[] | select(.createdAt > "YYYY-MM-DDT00:00:00Z")]'

Add new items to the existing tables in github-history.md.
Create individual shipped notes for any new significant PRs.
Update the quarterly breakdown.
Update the last-updated date.