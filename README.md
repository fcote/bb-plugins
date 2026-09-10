# Fabien's BB Plugins

A personal plugin marketplace for [BB](https://getbb.app). This repository contains the marketplace catalog and the source for its plugins.

## Plugins

| Plugin | What it does |
| --- | --- |
| [GitHub Actions](plugins/github-actions/README.md) | View recent workflow runs for the current thread’s repository, filter by branch or workflow, and open run details. |
| [Spotlight](plugins/spotlight/README.md) | Search projects and threads from any BB page with **Cmd+K** on macOS or **Ctrl+K** elsewhere. |

Spotlight groups results into **Projects**, **Active threads**, **Inactive threads**, and **Settled threads**. Select a project to open **New thread** with that project preselected, or select a thread to open its conversation.

Search matches project names, thread titles, thread IDs, and branch names. Results filter locally as you type, with no network request per keystroke. The catalog preloads and refreshes in the background while the search is open. Message content is not searched.

When BB Sidebar is available, Spotlight uses its inactivity settings and settled state. See the [Spotlight README](plugins/spotlight/README.md) for grouping details, keyboard controls, and development instructions.

## Install

Spotlight requires **BB 0.42+** and **Plugin SDK 0.4.47+**. Git installation also requires Git, Node.js, and npm on the BB host.

Once these files are published to this repository's `main` branch, add the marketplace and install Spotlight:

```sh
bb marketplace add git:https://github.com/fcote/bb-plugins.git@main
bb plugin install spotlight@fabien-plugins
```

Alternatively, install Spotlight directly from the repository:

```sh
bb plugin install git:https://github.com/fcote/bb-plugins.git@main --plugin spotlight
```

Open Spotlight with **Cmd+K** or **Ctrl+K**, or use **Spotlight search** in the sidebar footer. Use the arrow keys to choose a result, **Enter** to open it, and **Escape** to close the search.

## Develop locally

From the root of a local checkout, install dependencies, check the plugin, and register its directory with BB:

```sh
cd plugins/spotlight
npm install --include=dev
npm run typecheck
npm test
bb plugin build
bb plugin install .
```

Then run the development watcher from that same directory:

```sh
bb plugin dev
```

The watcher rebuilds and reloads the plugin as you edit. Disable Spotlight and release its shortcut with:

```sh
bb plugin disable spotlight
```

To register the local marketplace catalog, run this separately from the repository root:

```sh
bb marketplace add "path:$PWD"
```

This registers listings only. The catalog's plugin sources still point to GitHub; use the local plugin install above to run your working copy.

## Repository layout

| Path | Purpose |
| --- | --- |
| [marketplace.json](marketplace.json) | Marketplace identity, plugin listings, and install sources. |
| [.bb/plugins.json](.bb/plugins.json) | Collection index mapping plugin names to their directories. |
| [plugins/spotlight/](plugins/spotlight/) | Spotlight source, tests, package manifest, and documentation. |
| [plugins/github-actions/](plugins/github-actions/) | GitHub Actions panel, host integration, tests, and documentation. |

Each plugin owns its dependencies and build commands. Run npm commands inside the plugin directory.

## Add or publish a plugin

1. Put the plugin in its own directory under `plugins/`, with a `package.json` declaring its BB entry points, branding, and compatibility requirements.
2. Add its name and relative directory to [.bb/plugins.json](.bb/plugins.json).
3. Add its listing to [marketplace.json](marketplace.json), using an ID that matches the plugin's package identity and a Git or npm source that users can install.
4. Build and verify the plugin, then publish the source referenced by its listing.

The current Spotlight listing tracks `main` in `https://github.com/fcote/bb-plugins`. The [marketplace schema](https://getbb.app/schemas/marketplace.schema.json) describes supported listing fields, including release ranges and custom icons.

After publishing catalog changes, refresh discovery metadata:

```sh
bb marketplace refresh fabien-plugins
```

Refreshing a marketplace updates listings; it does not update installed plugin code. To update a Git-installed Spotlight:

```sh
bb plugin update spotlight
```
