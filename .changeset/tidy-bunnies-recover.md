---
'@techsquidtv/canvas-timeline-mediabunny-adapter': minor
---

**BREAKING:** Require `mediabunny@^1.56.0`. Upgrade the Mediabunny peer alongside
Canvas Timeline. This minor release follows the suite's fixed pre-1.0 release group.

Route background URL and Blob read failures through existing source recovery and
equivalent fallbacks, preserving the original terminal error and ignoring stale
callbacks after disposal. Custom URL error callbacks remain observers; supplied
inputs and factories retain responsibility for their source callbacks.

Validate negative timestamp mapping and Matroska presentation duration against
Mediabunny 1.56.0, and remove the obsolete BlobSource compatibility check.
