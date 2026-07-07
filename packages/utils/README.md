# @techsquidtv/canvas-timeline-utils

[![npm version](https://img.shields.io/npm/v/@techsquidtv/canvas-timeline-utils.svg)](https://www.npmjs.com/package/@techsquidtv/canvas-timeline-utils)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](https://github.com/techsquidtv/canvas-timeline/blob/main/LICENSE)
[![CI](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/techsquidtv/canvas-timeline/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-canvastimeline.com-0f766e.svg)](https://canvastimeline.com/packages/utils/)

Shared rational time and math utilities for Canvas Timeline libraries.

## Install

```bash
pnpm add @techsquidtv/canvas-timeline-utils
```

```ts
import { formatTime, fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils';
```

## Features

- Perform exact `RationalTime` arithmetic instead of accumulating float-second drift.
- Share time conversion, parsing, formatting, clamping, and rounding helpers across app and timeline code.
- Use Canvas Timeline-compatible time utilities in backend services, export routines, and external metadata stores without importing UI/editor dependencies.

## Usage

```ts
import { addRational, fromSeconds, toSeconds } from '@techsquidtv/canvas-timeline-utils/time';

const start = fromSeconds(2);
const duration = fromSeconds(3);
const end = addRational(start, duration);

console.log(toSeconds(end));
```

```ts
import { clamp } from '@techsquidtv/canvas-timeline-utils/math';
import { formatTimecode } from '@techsquidtv/canvas-timeline-utils/timecode';
```

## Documentation

- [Package docs](https://canvastimeline.com/packages/utils/)
- [API reference](https://canvastimeline.com/packages/utils/api)
- [Getting started](https://canvastimeline.com/docs/getting-started)
- [Demos](https://canvastimeline.com/demos/)
- [GitHub source](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/utils)

## Release Status

`0.0.1` is alpha software. Breaking changes may happen before `0.1.0`, and Canvas Timeline does not keep backwards-compatibility aliases or fallback APIs during this period.
