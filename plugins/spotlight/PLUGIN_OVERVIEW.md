## Jump straight to your work

Open Spotlight from any BB page with **Cmd+K on macOS** or **Ctrl+K elsewhere**. A search action in the sidebar footer also opens it without a keyboard.

## Find projects and threads

Results appear in four groups: Projects, Active threads, Inactive threads, and Settled threads. When BB Sidebar is available, Spotlight uses its lifecycle and inactivity settings to match the shelves you already use. Snoozed threads appear in Inactive and archived threads in Settled. Without BB Sidebar, Active contains running work, Inactive contains other unarchived threads, and Settled contains archived threads.

Search by project name, thread title, thread ID, or branch name. Matching ignores case and accents and supports multiple words. Filtering runs locally as you type, without a network request per keystroke. Each group shows up to 20 matches; narrow the query to find more. Hidden worker threads are excluded. Initial results preload before you open Spotlight and remain available while refreshing. Projects from BB’s client cache appear while the first thread results load. Results refresh every five seconds while Spotlight is open.

## Open with a keystroke

Use the arrow keys to choose a result and Enter to open it, or click a row. Selecting a project opens New thread with that project preselected. Selecting a thread opens the conversation. Escape closes the overlay and returns focus to where you were.

## Requirements

Requires BB 0.42 or newer and Plugin SDK 0.4.47 or newer. Uses BB's existing projects and threads; no external service or account is required. Spotlight handles its shortcut while enabled, including when a text field has focus. It searches thread metadata, not message content.
