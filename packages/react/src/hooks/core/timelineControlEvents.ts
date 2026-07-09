/**
 * Opaque interaction metadata forwarded by third-party scalar and range controls.
 *
 * @remarks
 *
 * Canvas Timeline does not inspect this value because each control primitive can
 * supply different commit details. Consumers that know their control library's
 * event shape can narrow it inside their callback before reading fields.
 */
export type TimelineControlCommitDetails = unknown;
