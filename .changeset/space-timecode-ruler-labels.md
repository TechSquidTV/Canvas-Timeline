---
'@techsquidtv/canvas-timeline': patch
'@techsquidtv/canvas-timeline-core': patch
'@techsquidtv/canvas-timeline-react': patch
'@techsquidtv/canvas-timeline-renderer': patch
---

Prevent ruler label overlap by exposing reusable minimum tick spacing and measuring canvas timecode labels against the resolved ruler font. Keep frame subticks evenly divided around major ticks for a consistent visual cadence.
