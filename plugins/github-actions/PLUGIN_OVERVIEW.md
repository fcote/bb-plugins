# GitHub Actions

Check workflow runs without leaving your bb thread. Open **Actions** in the thread header to see the repository’s recent runs, then narrow the list to the current branch or a workflow.

Each run shows its outcome, workflow, branch, commit, event, and time, with a link to GitHub for jobs and logs. The panel refreshes every 30 seconds while visible and retains the last successful result if a refresh fails.

The plugin follows the thread’s checkout and runs GitHub CLI on that checkout’s host. It uses the host’s existing `gh` authentication, supports GitHub Enterprise, and reports missing tools or access problems in the panel. Requires BB 0.42+ and SDK 0.4.47+.
