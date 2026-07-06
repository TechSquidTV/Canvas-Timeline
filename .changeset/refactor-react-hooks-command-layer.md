---
---

Refactor React hook edit ownership around the command layer.

This is a breaking React hooks/API change: structural clip edits now live on
`useTimelineEditCommands` instead of `useTimelineClips`, `useClipEditPreview`
has been removed, and preview impacts are composed through
`useTimelineEditImpacts` instead of `useTimelineEditPreview`.

Core edit impacts now allow source-less range operations with nullable source
clip and track IDs, and clip deletion is represented as a first-class
`delete-clips` edit command.
