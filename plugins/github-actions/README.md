# GitHub Actions

View GitHub Actions workflow runs for the current bb thread’s repository. Click **Actions** in the thread header, or select **GitHub Actions** from the side panel’s new-tab menu.

The panel shows the latest 50 runs with their status, workflow, branch, commit, event, and creation time. Open any run to see its jobs and logs on GitHub.

- **All branches** shows recent runs across the repository.
- **Current branch** filters by the checkout’s actual branch. Detached checkouts filter by commit instead.
- **Workflow** filters the fetched runs locally. It does not search older runs.
- Runs refresh every 30 seconds while the panel is mounted and the browser tab is visible. **Refresh** checks immediately. Failed refreshes retain the last successful result with a notice.

## Requirements

BB 0.42+ with Plugin SDK 0.4.47+. Git and GitHub CLI (`gh`) must be available on the **thread’s host**, with an existing `gh auth login` session that can read the repository and its Actions runs. The host must be connected to bb.

Repository detection prefers the checkout’s `origin` remote. Without `origin`, it uses GitHub CLI’s default remote. GitHub Enterprise works through the same CLI, provided the host has authenticated to that GitHub instance. Other CI providers are not supported.

## Install locally

From this repository’s root:

```sh
cd plugins/github-actions
npm install --include=dev
npm run typecheck
npm test
bb plugin build
bb plugin install .
```

For iterative development, run `bb plugin dev` in this directory.

Once this plugin is published on the repository’s `main` branch, install it through the collection:

```sh
bb plugin install git:https://github.com/fcote/bb-plugins.git@main --plugin github-actions
```

## CLI

Inside a bb thread:

```sh
bb github-actions list
bb github-actions list --branch
```

From elsewhere, pass `--thread <thread-id>`. Output is JSON with at most 50 runs. The command exits with status 1 when the repository or host is unavailable.

## Implementation

[server.ts](server.ts) resolves the requested thread’s current environment and routes the request to its host. [host.ts](host.ts) invokes Git and `gh` there through argument arrays with timeouts and bounded output. [contract.ts](contract.ts) validates requests and responses. [app.tsx](app.tsx) provides the thread header action and panel.

This plugin reads run data only. It does not trigger, cancel, or rerun workflows, and does not store credentials. Use GitHub’s run page for jobs, logs, older runs, and workflow actions.

Tests cover host routing, input validation, repository and branch handling, malformed results, setup errors, filtering, request races, refresh recovery, and polling cleanup.
