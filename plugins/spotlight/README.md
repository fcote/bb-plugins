# Spotlight

Search BB projects and threads with **Cmd+K** on macOS or **Ctrl+K** elsewhere. Also available from the sidebar footer.

Results are grouped as Projects, Active threads, Inactive threads, and Settled threads. When BB Sidebar is available, Spotlight reads its lifecycle and inactivity settings to match its shelves. Snoozed threads appear in Inactive; archived threads appear in Settled. Without BB Sidebar, Active means running work, Inactive means other unarchived threads, and Settled means archived threads. Selecting a project opens **New thread** with the project preselected. Selecting a thread opens it.

Search matches titles, project names, thread IDs, and branch names; message bodies are not searched. Matching ignores case and accents. Filtering runs locally as you type, without a network request per keystroke. Up to 20 results appear per group, with totals shown. Refine the query to find more. Hidden and deleted threads are excluded. Initial results preload when the plugin mounts. Until they arrive, opening shows projects from BB’s existing client cache while thread results load. Cached results stay visible during refresh. Results refresh every five seconds while open.

## Local development

Requires Node.js, npm, and BB 0.42+ with Plugin SDK 0.4.47+.

From the repository root:

```sh
cd plugins/spotlight
npm install --include=dev
npm run typecheck
npm test
bb plugin build
bb plugin install .
```

Use `bb plugin dev` to rebuild and reload while editing. `bb plugin disable spotlight` releases the keyboard shortcut. The overlay uses BB's theme and supports arrow keys, Enter, Escape, and pointer selection.

## Git install

Once this repository is pushed:

```sh
bb plugin install git:https://github.com/fcote/bb-plugins.git@main --plugin spotlight
```

The root collection manifest maps `spotlight` to this directory. The marketplace entry follows `main`; publish immutable release tags before switching to version ranges.
