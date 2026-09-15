Review the current git diff against main.

Check for:
- Logic errors or edge cases
- Security issues (hardcoded secrets, SQL injection, XSS)
- Missing error handling
- Missing or inadequate tests
- Violations of the project's code style
- Performance concerns

Group findings by severity:
🔴 Critical — must fix before merge
🟡 Warning — should fix, creates tech debt if not
🟢 Suggestion — nice to have, style preference

For each finding, show the specific code and suggest a fix.