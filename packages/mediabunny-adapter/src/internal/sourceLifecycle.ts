import type {
  TimelineMediaSourceAttempt,
  TimelineMediaSourceOperationResult,
  TimelineMediaSourceTiming,
} from '@techsquidtv/canvas-timeline-core';
import type * as Mediabunny from 'mediabunny';
import type {
  CreateMediabunnyAdapterOptions,
  MediabunnyModule,
  MediabunnySource,
  MediabunnySourceInput,
  MediabunnySourceMetadata,
  MediabunnySourceState,
} from '#mediabunny-adapter/types';
import {
  createController,
  type MediabunnySourceController,
  toLogicalSourceSeconds,
} from '#mediabunny-adapter/internal/sourceController';
import { setTimelineClock } from '#mediabunny-adapter/internal/transportClock';

interface LoadedMediaInfo {
  metadata: MediabunnySourceMetadata;
}

export interface MediabunnySourceLoadToken {
  sourceId: string;
  generation: number;
}

interface PendingSourceRecovery {
  controller: MediabunnySourceController;
  error: Error;
  previousState: MediabunnySourceState | undefined;
  promise: Promise<TimelineMediaSourceOperationResult> | null;
}

interface PendingSourceReplacement {
  previousState: MediabunnySourceState | undefined;
  candidate: MediabunnySourceController | null;
  readyState: MediabunnySourceState | null;
  deferredRecovery: PendingSourceRecovery | null;
  promise: Promise<TimelineMediaSourceOperationResult> | null;
}

interface MediabunnySourceOperationState {
  generation: number;
  preloadPromise: Promise<TimelineMediaSourceOperationResult> | null;
  replacement: PendingSourceReplacement | null;
  recovery: PendingSourceRecovery | null;
}

interface MediabunnySourceLoadOptions {
  status: 'loading' | 'recovering';
  token: MediabunnySourceLoadToken;
  startIndex?: number;
  previousAttempts?: readonly TimelineMediaSourceAttempt[];
  replacement?: PendingSourceReplacement;
}

interface MediabunnySourceControllerRuntime {
  ensureAudioRuntime: (notifyChange?: boolean) => {
    context: AudioContext;
    gainNode: GainNode;
  } | null;
  getTransportState: () => {
    timelineSeconds: number;
    playbackRate: number;
    playing: boolean;
  };
  activatePendingAudioClock: () => void;
  stopController: (controller: MediabunnySourceController) => void;
  disposeController: (controller: MediabunnySourceController) => void;
}

interface MediabunnySourceOutputRuntime {
  invalidateOperations: (affectedSourceIds?: ReadonlySet<string>) => void;
  clearPreview: (controller: MediabunnySourceController) => void;
  refreshPausedVisual: (sourceIds: ReadonlySet<string>, supersedeInFlight?: boolean) => void;
}

export class MediabunnySourceLifecycle {
  readonly #isActive: () => boolean;
  readonly #notify: () => void;
  readonly #loadModule: () => MediabunnyModule | Promise<MediabunnyModule>;
  readonly #selectTracks: CreateMediabunnyAdapterOptions['selectTracks'];
  readonly #controllerRuntime: MediabunnySourceControllerRuntime;
  readonly #outputRuntime: MediabunnySourceOutputRuntime;
  readonly #controllers = new Map<string, MediabunnySourceController>();
  readonly #definitions: Map<string, MediabunnySource>;
  readonly #operations = new Map<string, MediabunnySourceOperationState>();
  readonly #activeSourceIds = new Set<string>();
  #snapshot: ReadonlyMap<string, MediabunnySourceState>;
  #modulePromise: Promise<MediabunnyModule> | null = null;
  #ready: boolean;
  #status: string;
  #error: Error | null = null;

  constructor(
    sources: readonly MediabunnySource[],
    loadModule: () => MediabunnyModule | Promise<MediabunnyModule>,
    selectTracks: CreateMediabunnyAdapterOptions['selectTracks'],
    controllerRuntime: MediabunnySourceControllerRuntime,
    outputRuntime: MediabunnySourceOutputRuntime,
    isActive: () => boolean,
    notify: () => void
  ) {
    this.#isActive = isActive;
    this.#notify = notify;
    this.#loadModule = loadModule;
    this.#selectTracks = selectTracks;
    this.#controllerRuntime = controllerRuntime;
    this.#outputRuntime = outputRuntime;
    this.#definitions = new Map(sources.map((source) => [source.sourceId, source]));
    this.#snapshot = new Map(
      sources.map((source) => [source.sourceId, createIdleSourceState(source.sourceId)])
    );
    this.#ready = sources.length > 0;
    this.#status = this.#ready
      ? 'Sources registered. Mediabunny loads active media on demand.'
      : 'No Mediabunny sources are configured.';
  }

  get ready() {
    return this.#ready;
  }

  get status() {
    return this.#status;
  }

  get error() {
    return this.#error;
  }

  get sourceStateById() {
    return this.#snapshot;
  }

  get sourceCount() {
    return this.#definitions.size;
  }

  getController(sourceId: string) {
    return this.#controllers.get(sourceId);
  }

  hasController(sourceId: string) {
    return this.#controllers.has(sourceId);
  }

  controllerValues() {
    return this.#controllers.values();
  }

  setController(controller: MediabunnySourceController) {
    this.#controllers.set(controller.sourceId, controller);
  }

  deleteController(sourceId: string) {
    this.#controllers.delete(sourceId);
  }

  clearControllers() {
    this.#controllers.clear();
  }

  getDefinition(sourceId: string) {
    return this.#definitions.get(sourceId);
  }

  hasDefinition(sourceId: string) {
    return this.#definitions.has(sourceId);
  }

  definitionEntries() {
    return this.#definitions.entries();
  }

  replaceDefinitions(sources: readonly MediabunnySource[]) {
    this.#definitions.clear();
    for (const source of sources) {
      this.#definitions.set(source.sourceId, source);
    }
  }

  setDefinition(source: MediabunnySource) {
    this.#definitions.set(source.sourceId, source);
  }

  getState(sourceId: string) {
    return this.#snapshot.get(sourceId);
  }

  updateState(state: MediabunnySourceState) {
    const nextSnapshot = new Map(this.#snapshot);
    nextSnapshot.set(state.sourceId, state);
    this.#snapshot = nextSnapshot;
  }

  replaceSnapshot(snapshot: ReadonlyMap<string, MediabunnySourceState>) {
    this.#snapshot = snapshot;
  }

  clearSnapshot() {
    this.#snapshot = new Map();
  }

  getExistingOperation(sourceId: string) {
    return this.#operations.get(sourceId);
  }

  getOperation(sourceId: string) {
    let operation = this.#operations.get(sourceId);
    if (operation === undefined) {
      operation = {
        generation: 0,
        preloadPromise: null,
        replacement: null,
        recovery: null,
      };
      this.#operations.set(sourceId, operation);
    }
    return operation;
  }

  operationEntries() {
    return this.#operations.entries();
  }

  beginLoad(sourceId: string): MediabunnySourceLoadToken {
    const operation = this.getOperation(sourceId);
    operation.generation += 1;
    operation.preloadPromise = null;
    return { sourceId, generation: operation.generation };
  }

  isCurrentLoad(token: MediabunnySourceLoadToken) {
    return this.#isActive() && this.getOperation(token.sourceId).generation === token.generation;
  }

  hasActiveSource(sourceId: string) {
    return this.#activeSourceIds.has(sourceId);
  }

  activeSourceValues() {
    return this.#activeSourceIds.values();
  }

  replaceActiveSources(sourceIds: Iterable<string>) {
    this.#activeSourceIds.clear();
    for (const sourceId of sourceIds) {
      this.#activeSourceIds.add(sourceId);
    }
  }

  loadModule() {
    this.#modulePromise ??= Promise.resolve().then(this.#loadModule);
    return this.#modulePromise;
  }

  resetModule(modulePromise: Promise<MediabunnyModule>) {
    if (this.#modulePromise === modulePromise) {
      this.#modulePromise = null;
    }
  }

  assertActive() {
    if (!this.#isActive()) {
      throw new Error('Mediabunny adapter has been disposed.');
    }
  }

  setStatus(status: string) {
    if (!this.#isActive()) {
      return;
    }
    this.#status = status;
    this.#notify();
  }

  isCurrentOwnership(ownership: readonly MediabunnySourceLoadToken[]) {
    return (
      this.#isActive() &&
      ownership.every((token) => {
        const operation = this.getOperation(token.sourceId);
        return operation.generation === token.generation && this.hasController(token.sourceId);
      })
    );
  }

  async ensureSources(
    sourceIds: Iterable<string>,
    isCurrentRequest: () => boolean
  ): Promise<readonly MediabunnySourceLoadToken[] | null> {
    const requestedSourceIds = [...new Set(sourceIds)];
    const sourceResults = await Promise.all(
      requestedSourceIds.map(async (sourceId) => {
        while (true) {
          if (!isCurrentRequest()) {
            return false;
          }
          const result = await this.ensureSource(sourceId);
          if (!isCurrentRequest()) {
            return false;
          }
          if (result.ok) {
            return true;
          }
          if (isSupersededSourceLoadResult(result) && this.hasDefinition(sourceId)) {
            continue;
          }
          throw result.error;
        }
      })
    );
    if (sourceResults.some((sourceReady) => !sourceReady)) {
      return null;
    }

    return requestedSourceIds.map((sourceId) => ({
      sourceId,
      generation: this.getOperation(sourceId).generation,
    }));
  }

  ensureSource(sourceId: string): Promise<TimelineMediaSourceOperationResult> {
    const operation = this.getExistingOperation(sourceId);
    const activeRecovery = operation?.recovery;
    if (activeRecovery?.promise !== null && activeRecovery?.promise !== undefined) {
      return activeRecovery.promise;
    }
    const activeReplacement = operation?.replacement ?? null;
    if (activeReplacement !== null) {
      if (this.hasController(sourceId) && activeReplacement.deferredRecovery === null) {
        return Promise.resolve({ ok: true, sourceId, state: 'ready' });
      }
      if (activeReplacement.promise === null) {
        return Promise.resolve().then(() => this.ensureSource(sourceId));
      }
      return activeReplacement.promise.then((result) => {
        if (result.ok || !this.hasDefinition(sourceId)) {
          return result;
        }
        return this.ensureSource(sourceId);
      });
    }
    const source = this.getDefinition(sourceId);
    if (source === undefined) {
      return Promise.resolve(createUnknownSourceResult(sourceId));
    }
    const sourceOperation = operation ?? this.getOperation(sourceId);
    if (this.hasController(sourceId)) {
      return Promise.resolve({ ok: true, sourceId, state: 'ready' });
    }
    const existingPromise = sourceOperation.preloadPromise;
    if (existingPromise !== null) {
      return existingPromise;
    }

    sourceOperation.recovery = null;
    const token = this.beginLoad(sourceId);
    const loadPromise = this.#loadSource(source, { status: 'loading', token }).finally(() => {
      if (sourceOperation.preloadPromise === loadPromise) {
        sourceOperation.preloadPromise = null;
      }
    });
    sourceOperation.preloadPromise = loadPromise;
    return loadPromise;
  }

  async preloadSource(sourceId: string) {
    this.assertActive();
    const result = await this.ensureSource(sourceId);
    if (result.ok) {
      this.#outputRuntime.refreshPausedVisual(new Set([sourceId]), false);
    }
    return result;
  }

  unloadSource(sourceId: string) {
    this.assertActive();
    if (!this.hasDefinition(sourceId)) {
      return false;
    }
    this.#releaseSource(sourceId, true);
    this.#status = 'Source unloaded. It will reload when active or explicitly preloaded.';
    this.#setSourceState(createIdleSourceState(sourceId));
    return true;
  }

  async retrySource(sourceId: string): Promise<TimelineMediaSourceOperationResult> {
    this.assertActive();
    const source = this.getDefinition(sourceId);
    if (source === undefined) {
      return createUnknownSourceResult(sourceId);
    }
    this.#outputRuntime.invalidateOperations(new Set([sourceId]));
    const operation = this.getOperation(sourceId);
    const pendingReplacement = operation.replacement;
    const recovery = operation.recovery ?? pendingReplacement?.deferredRecovery ?? null;
    operation.recovery = null;
    this.#discardPendingReplacement(sourceId);
    const previousState =
      recovery?.previousState ?? pendingReplacement?.previousState ?? this.getState(sourceId);
    const previousController = this.getController(sourceId);
    const previousStatus = this.#status;
    const previousError = this.#error;
    const token = this.beginLoad(sourceId);
    const result = await this.#loadSource(source, { status: 'loading', token });
    if (!this.isCurrentLoad(token)) {
      return createSupersededSourceLoadResult(sourceId);
    }
    if (!result.ok && previousController !== undefined) {
      if (recovery !== null) {
        this.#discardCurrentController(sourceId, previousController);
      } else if (previousState !== undefined) {
        this.#status = previousStatus;
        this.#error = previousError;
        this.#setSourceState(previousState);
      }
    }
    if (result.ok) {
      this.#outputRuntime.refreshPausedVisual(new Set([sourceId]));
    }
    return result;
  }

  async replaceSource(source: MediabunnySource): Promise<TimelineMediaSourceOperationResult> {
    this.assertActive();
    try {
      validateSources([source]);
    } catch (sourceError) {
      return {
        ok: false,
        sourceId: source.sourceId,
        reason: 'invalid-source',
        error: sourceError instanceof Error ? sourceError : new Error(String(sourceError)),
      };
    }
    this.#outputRuntime.invalidateOperations(new Set([source.sourceId]));
    const operation = this.getOperation(source.sourceId);
    const previousReplacement = operation.replacement;
    const activeRecovery = operation.recovery;
    operation.recovery = null;
    const replacement: PendingSourceReplacement = {
      previousState: previousReplacement?.previousState ?? this.getState(source.sourceId),
      candidate: null,
      readyState: null,
      deferredRecovery: previousReplacement?.deferredRecovery ?? activeRecovery,
      promise: null,
    };
    this.#discardPendingReplacement(source.sourceId);
    operation.replacement = replacement;
    const token = this.beginLoad(source.sourceId);
    const replacementPromise = (async (): Promise<TimelineMediaSourceOperationResult> => {
      try {
        const result = await this.#loadSource(source, {
          status: 'loading',
          token,
          replacement,
        });
        if (!this.isCurrentLoad(token) || operation.replacement !== replacement) {
          return createSupersededSourceLoadResult(source.sourceId);
        }
        if (result.ok) {
          if (replacement.candidate === null || replacement.readyState === null) {
            operation.replacement = null;
            return {
              ok: false,
              sourceId: source.sourceId,
              reason: 'load-failed',
              error: new Error(
                `Replacement source "${source.sourceId}" did not produce a controller.`
              ),
            };
          }
          if (replacement.candidate.audioSink !== null) {
            const audioNodes = this.#controllerRuntime.ensureAudioRuntime(false);
            if (audioNodes === null) {
              replacement.candidate.audioSink = null;
            } else {
              replacement.candidate.audioContext = audioNodes.context;
              replacement.candidate.gainNode = audioNodes.gainNode;
            }
          }
          if (!this.isCurrentLoad(token) || operation.replacement !== replacement) {
            return createSupersededSourceLoadResult(source.sourceId);
          }
          operation.replacement = null;
          if (!this.#commitLoadedController(replacement.candidate, replacement.readyState, false)) {
            return createSupersededSourceLoadResult(source.sourceId);
          }
          this.setDefinition(source);
          this.#ready = true;
          this.#notify();
          this.#outputRuntime.refreshPausedVisual(new Set([source.sourceId]));
        } else {
          operation.replacement = null;
          const nextSnapshot = new Map(this.sourceStateById);
          if (replacement.previousState === undefined) {
            nextSnapshot.delete(source.sourceId);
          } else {
            nextSnapshot.set(source.sourceId, replacement.previousState);
          }
          this.replaceSnapshot(nextSnapshot);
          this.#notify();
          const deferredRecovery = replacement.deferredRecovery;
          if (
            deferredRecovery !== null &&
            this.getController(source.sourceId) === deferredRecovery.controller &&
            this.hasDefinition(source.sourceId)
          ) {
            void this.recoverSource(
              source.sourceId,
              deferredRecovery.controller,
              deferredRecovery.error
            );
          }
        }
        return result;
      } finally {
        if (operation.replacement === replacement) {
          this.#discardPendingReplacement(source.sourceId);
        }
      }
    })();
    replacement.promise = replacementPromise;
    return replacementPromise;
  }

  recoverSource(
    sourceId: string,
    expectedController: MediabunnySourceController,
    recoveryError: Error
  ): Promise<TimelineMediaSourceOperationResult> {
    const source = this.getDefinition(sourceId);
    const controller = this.getController(sourceId);
    const operation = this.getOperation(sourceId);
    const activeRecovery = operation.recovery;
    if (activeRecovery?.promise !== null && activeRecovery?.promise !== undefined) {
      return activeRecovery.promise;
    }
    if (source === undefined || controller !== expectedController || !this.#isActive()) {
      return Promise.resolve(createSupersededSourceLoadResult(sourceId));
    }
    const recovery: PendingSourceRecovery = {
      controller: expectedController,
      error: recoveryError,
      previousState: this.getState(sourceId),
      promise: null,
    };
    const pendingReplacement = operation.replacement;
    if (pendingReplacement !== null) {
      pendingReplacement.deferredRecovery ??= recovery;
      return Promise.resolve(createSupersededSourceLoadResult(sourceId));
    }
    operation.recovery = recovery;
    this.#controllerRuntime.stopController(controller);
    const attempts = [
      ...(recovery.previousState?.attempts ?? []),
      {
        inputIndex: controller.inputIndex,
        status: 'failed',
        error: recoveryError,
      } as const,
    ];
    const token = this.beginLoad(sourceId);
    const recoveryPromise = (async () => {
      try {
        const result = await this.#loadSource(source, {
          status: 'recovering',
          token,
          startIndex: controller.inputIndex + 1,
          previousAttempts: attempts,
        });
        if (result.ok && this.isCurrentLoad(token)) {
          this.#outputRuntime.refreshPausedVisual(new Set([sourceId]), false);
        }
        return result;
      } finally {
        if (operation.recovery === recovery) {
          operation.recovery = null;
        }
      }
    })();
    recovery.promise = recoveryPromise;
    return recoveryPromise;
  }

  setSources(nextSources: readonly MediabunnySource[]) {
    this.assertActive();
    validateSources(nextSources);
    const nextDefinitions = new Map(nextSources.map((source) => [source.sourceId, source]));
    const supersededReplacements = new Map<string, PendingSourceReplacement>();
    for (const [sourceId, operation] of this.operationEntries()) {
      if (operation.replacement !== null) {
        supersededReplacements.set(sourceId, operation.replacement);
      }
    }
    const changedSourceIds = new Set<string>();
    for (const [sourceId, source] of this.definitionEntries()) {
      const nextSource = nextDefinitions.get(sourceId);
      if (nextSource === undefined || !areMediabunnySourcesEqual(source, nextSource)) {
        changedSourceIds.add(sourceId);
      }
    }
    for (const sourceId of nextDefinitions.keys()) {
      if (!this.hasDefinition(sourceId)) {
        changedSourceIds.add(sourceId);
      }
    }
    if (
      changedSourceIds.size === 0 &&
      this.sourceCount === nextDefinitions.size &&
      supersededReplacements.size === 0
    ) {
      return;
    }
    this.#outputRuntime.invalidateOperations(changedSourceIds);
    for (const sourceId of supersededReplacements.keys()) {
      this.#invalidateSourceLoad(sourceId);
    }
    for (const sourceId of changedSourceIds) {
      this.#releaseSource(sourceId, !nextDefinitions.has(sourceId));
    }
    const previousSnapshot = this.sourceStateById;
    this.replaceDefinitions(nextSources);
    this.replaceSnapshot(
      new Map(
        nextSources.map((source) => {
          const previousState = previousSnapshot.get(source.sourceId);
          const replacementState = supersededReplacements.get(source.sourceId)?.previousState;
          return [
            source.sourceId,
            changedSourceIds.has(source.sourceId)
              ? createIdleSourceState(source.sourceId)
              : (replacementState ?? previousState ?? createIdleSourceState(source.sourceId)),
          ];
        })
      )
    );
    this.#ready = nextSources.length > 0;
    this.#error = null;
    this.#status = this.#ready
      ? 'Sources registered. Mediabunny loads active media on demand.'
      : 'No Mediabunny sources are configured.';
    this.#notify();
    this.#outputRuntime.refreshPausedVisual(changedSourceIds);
  }

  dispose() {
    if (!this.#isActive()) {
      return;
    }
    for (const controller of this.controllerValues()) {
      this.#controllerRuntime.disposeController(controller);
    }
    this.clearControllers();
    for (const [sourceId, operation] of this.operationEntries()) {
      operation.generation += 1;
      operation.preloadPromise = null;
      operation.recovery = null;
      this.#discardPendingReplacement(sourceId);
    }
    this.clearSnapshot();
    this.#ready = false;
    this.#status = 'Mediabunny adapter disposed.';
    this.#error = null;
  }

  async #loadSource(
    source: MediabunnySource,
    loadOptions: MediabunnySourceLoadOptions
  ): Promise<TimelineMediaSourceOperationResult> {
    const {
      status: loadStatus,
      token,
      startIndex = 0,
      previousAttempts = [],
      replacement,
    } = loadOptions;
    const inputs = [source.input, ...(source.fallbacks ?? [])];
    const isCurrentLoad = () => this.isCurrentLoad(token);
    if (!isCurrentLoad()) {
      return createSupersededSourceLoadResult(source.sourceId);
    }
    this.#setSourceState({
      sourceId: source.sourceId,
      status: loadStatus,
      selectedInputIndex: null,
      attempts: previousAttempts,
      metadata: null,
      error: null,
    });

    const modulePromise = this.loadModule();
    let mediabunny: MediabunnyModule;
    try {
      mediabunny = await modulePromise;
    } catch (moduleError) {
      this.resetModule(modulePromise);
      const loadError = moduleError instanceof Error ? moduleError : new Error(String(moduleError));
      if (!isCurrentLoad()) {
        return createSupersededSourceLoadResult(source.sourceId);
      }
      if (replacement === undefined) {
        this.#error = loadError;
        this.#status = loadError.message;
        this.#setSourceState({
          sourceId: source.sourceId,
          status: 'failed',
          selectedInputIndex: null,
          attempts: previousAttempts,
          metadata: null,
          error: loadError,
        });
      }
      return {
        ok: false,
        sourceId: source.sourceId,
        reason: 'load-failed',
        error: loadError,
      };
    }
    if (!isCurrentLoad()) {
      return createSupersededSourceLoadResult(source.sourceId);
    }
    const attempts = [...previousAttempts];
    let finalError = new Error(
      `No remaining inputs are available for source "${source.sourceId}".`
    );

    for (let inputIndex = startIndex; inputIndex < inputs.length; inputIndex += 1) {
      const sourceInput = inputs[inputIndex];
      if (sourceInput === undefined) {
        continue;
      }
      const candidate = createController(source.sourceId, inputIndex, source.timing);
      try {
        const loaded = await loadMediabunnySourceController(
          candidate,
          mediabunny,
          source,
          sourceInput,
          this.#selectTracks,
          this.#controllerRuntime.ensureAudioRuntime,
          isCurrentLoad,
          replacement !== undefined
        );
        if (!isCurrentLoad()) {
          this.#controllerRuntime.disposeController(candidate);
          return createSupersededSourceLoadResult(source.sourceId);
        }

        attempts.push({ inputIndex, status: 'ready', error: null });
        const readyState: MediabunnySourceState = {
          sourceId: source.sourceId,
          status: 'ready',
          selectedInputIndex: inputIndex,
          attempts,
          metadata: loaded.metadata,
          error: null,
        };
        if (replacement !== undefined) {
          replacement.candidate = candidate;
          replacement.readyState = readyState;
        } else if (!this.#commitLoadedController(candidate, readyState, true)) {
          return createSupersededSourceLoadResult(source.sourceId);
        }
        return { ok: true, sourceId: source.sourceId, state: 'ready' };
      } catch (sourceError) {
        this.#controllerRuntime.disposeController(candidate);
        if (!isCurrentLoad()) {
          return createSupersededSourceLoadResult(source.sourceId);
        }
        finalError = sourceError instanceof Error ? sourceError : new Error(String(sourceError));
        attempts.push({ inputIndex, status: 'failed', error: finalError });
      }
    }

    if (!isCurrentLoad()) {
      return createSupersededSourceLoadResult(source.sourceId);
    }
    const previous = this.getController(source.sourceId);
    if (loadStatus === 'recovering' && previous !== undefined) {
      this.#controllerRuntime.disposeController(previous);
      this.deleteController(source.sourceId);
    }
    if (replacement === undefined) {
      this.#error = finalError;
      this.#status = finalError.message;
      this.#setSourceState({
        sourceId: source.sourceId,
        status: 'failed',
        selectedInputIndex: null,
        attempts,
        metadata: null,
        error: finalError,
      });
    }
    return { ok: false, sourceId: source.sourceId, reason: 'load-failed', error: finalError };
  }

  #commitLoadedController(
    candidate: MediabunnySourceController,
    readyState: MediabunnySourceState,
    notifyReady: boolean
  ) {
    if (!this.#isActive()) {
      this.#controllerRuntime.disposeController(candidate);
      return false;
    }
    const previous = this.getController(candidate.sourceId);
    const transport = this.#controllerRuntime.getTransportState();
    if (previous !== undefined) {
      this.#controllerRuntime.disposeController(previous);
    }
    this.setController(candidate);
    setTimelineClock(candidate, transport.timelineSeconds, transport.playbackRate);
    candidate.playing = transport.playing;
    if (!this.#isActive()) {
      return false;
    }
    this.#error = null;
    this.#status = 'Ready. Mediabunny can drive timeline video and audio.';
    if (notifyReady) {
      this.#setSourceState(readyState);
    } else {
      this.updateState(readyState);
    }
    if (candidate.audioSink !== null) {
      this.#controllerRuntime.activatePendingAudioClock();
    }
    return this.#isActive();
  }

  #setSourceState(state: MediabunnySourceState) {
    if (!this.#isActive()) {
      return;
    }
    this.updateState(state);
    this.#notify();
  }

  #invalidateSourceLoad(sourceId: string) {
    const operation = this.getOperation(sourceId);
    operation.generation += 1;
    operation.preloadPromise = null;
    operation.recovery = null;
    this.#discardPendingReplacement(sourceId);
  }

  #releaseSource(sourceId: string, invalidateActiveRequests = false) {
    if (invalidateActiveRequests || this.hasActiveSource(sourceId)) {
      this.#outputRuntime.invalidateOperations(new Set([sourceId]));
    }
    this.#invalidateSourceLoad(sourceId);
    const controller = this.getController(sourceId);
    if (controller !== undefined) {
      if (this.hasActiveSource(sourceId)) {
        this.#outputRuntime.clearPreview(controller);
      }
      this.#controllerRuntime.disposeController(controller);
      this.deleteController(sourceId);
    }
  }

  #discardCurrentController(sourceId: string, expectedController: MediabunnySourceController) {
    if (this.getController(sourceId) !== expectedController) {
      return;
    }
    this.#controllerRuntime.disposeController(expectedController);
    this.deleteController(sourceId);
  }

  #discardPendingReplacement(sourceId: string) {
    const operation = this.getOperation(sourceId);
    const replacement = operation.replacement;
    if (replacement?.candidate !== null && replacement?.candidate !== undefined) {
      this.#controllerRuntime.disposeController(replacement.candidate);
    }
    operation.replacement = null;
  }
}

function createUnknownSourceResult(sourceId: string): TimelineMediaSourceOperationResult {
  return {
    ok: false,
    sourceId,
    reason: 'unknown-source',
    error: new Error(`Unknown source "${sourceId}".`),
  };
}

export function validateSources(sources: readonly MediabunnySource[]) {
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (source.sourceId.length === 0) {
      throw new Error('Mediabunny sourceId cannot be empty.');
    }
    if (sourceIds.has(source.sourceId)) {
      throw new Error(`Duplicate Mediabunny sourceId "${source.sourceId}".`);
    }
    sourceIds.add(source.sourceId);
    validateMediabunnyTiming(source.sourceId, source.timing);
  }
}

export function assertValidMediabunnyVolume(volume: number) {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError('volume must be a finite number from 0 to 1.');
  }
}

function validateMediabunnyTiming(sourceId: string, timing: TimelineMediaSourceTiming | undefined) {
  if (
    timing !== undefined &&
    (!Number.isFinite(timing.sourceTimeSeconds) || !Number.isFinite(timing.mediaTimeSeconds))
  ) {
    throw new Error(`Source "${sourceId}" timing values must be finite.`);
  }
}

function createIdleSourceState(sourceId: string): MediabunnySourceState {
  return {
    sourceId,
    status: 'idle',
    selectedInputIndex: null,
    attempts: [],
    metadata: null,
    error: null,
  };
}

class SupersededSourceLoadError extends Error {
  override readonly name = 'SupersededSourceLoadError';

  constructor(sourceId: string) {
    super(`Loading source "${sourceId}" was superseded.`);
  }
}

function createSupersededSourceLoadResult(sourceId: string): TimelineMediaSourceOperationResult {
  return {
    ok: false,
    sourceId,
    reason: 'load-failed',
    error: new SupersededSourceLoadError(sourceId),
  };
}

function isSupersededSourceLoadResult(
  result: TimelineMediaSourceOperationResult
): result is Extract<TimelineMediaSourceOperationResult, { ok: false }> {
  return !result.ok && result.error instanceof SupersededSourceLoadError;
}

function areMediabunnySourcesEqual(left: MediabunnySource, right: MediabunnySource) {
  const leftFallbacks = left.fallbacks ?? [];
  const rightFallbacks = right.fallbacks ?? [];
  return (
    left.sourceId === right.sourceId &&
    areMediabunnySourceInputsEqual(left.input, right.input) &&
    leftFallbacks.length === rightFallbacks.length &&
    leftFallbacks.every((input, index) => {
      const rightInput = rightFallbacks[index];
      return rightInput !== undefined && areMediabunnySourceInputsEqual(input, rightInput);
    }) &&
    left.timing?.sourceTimeSeconds === right.timing?.sourceTimeSeconds &&
    left.timing?.mediaTimeSeconds === right.timing?.mediaTimeSeconds
  );
}

function areMediabunnySourceInputsEqual(
  left: MediabunnySourceInput,
  right: MediabunnySourceInput
): boolean {
  if (left === right) {
    return true;
  }
  if (left instanceof URL && right instanceof URL) {
    return left.href === right.href;
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null ||
    !('kind' in left) ||
    !('kind' in right) ||
    left.kind !== right.kind
  ) {
    return false;
  }
  if (left.kind === 'url' && right.kind === 'url') {
    const leftFormats = left.formats ?? [];
    const rightFormats = right.formats ?? [];
    return (
      areMediabunnyUrlsEqual(left.url, right.url) &&
      leftFormats.length === rightFormats.length &&
      leftFormats.every((format, index) => format === rightFormats[index]) &&
      left.urlSourceOptions === right.urlSourceOptions
    );
  }
  if (left.kind === 'input' && right.kind === 'input') {
    return left.input === right.input;
  }
  return (
    left.kind === 'input-factory' &&
    right.kind === 'input-factory' &&
    left.createInput === right.createInput
  );
}

function areMediabunnyUrlsEqual(left: string | URL | Request, right: string | URL | Request) {
  if (left === right) {
    return true;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right;
  }
  if (left instanceof URL && right instanceof URL) {
    return left.href === right.href;
  }
  return false;
}

async function loadMediabunnySourceController(
  controller: MediabunnySourceController,
  mediabunny: MediabunnyModule,
  source: MediabunnySource,
  sourceInput: MediabunnySourceInput,
  selectTracks: CreateMediabunnyAdapterOptions['selectTracks'],
  ensureAudioRuntime: (notifyChange?: boolean) => {
    context: AudioContext;
    gainNode: GainNode;
  } | null,
  isCurrentLoad: () => boolean,
  deferAudioRuntime: boolean
): Promise<LoadedMediaInfo> {
  const assertCurrentLoad = () => {
    if (!isCurrentLoad()) {
      throw new SupersededSourceLoadError(source.sourceId);
    }
  };
  const input = await createInput(mediabunny, sourceInput);
  controller.input = input;
  controller.ownsInput = !isSuppliedMediabunnyInput(sourceInput);
  assertCurrentLoad();

  let videoTrack: Mediabunny.InputVideoTrack | null;
  let audioTrack: Mediabunny.InputAudioTrack | null;
  if (selectTracks === undefined) {
    [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
  } else {
    const [videoTracks, audioTracks] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
    ]);
    ({ videoTrack, audioTrack } = await selectTracks({
      source,
      sourceInput,
      input,
      videoTracks,
      audioTracks,
    }));
  }
  assertCurrentLoad();
  type InputTrack = NonNullable<typeof videoTrack> | NonNullable<typeof audioTrack>;
  const tracks = [videoTrack, audioTrack].filter((track): track is InputTrack => track !== null);

  if (tracks.length === 0) {
    throw new Error(`No audio or video track found for source "${source.sourceId}".`);
  }

  const firstTimestamp = await input.getFirstTimestamp(tracks);
  assertCurrentLoad();
  const presentationStartTimestamp = Math.max(firstTimestamp, 0);
  const metadataEndTimestamp = await input.getDurationFromMetadata(tracks, {
    skipLiveWait: true,
  });
  assertCurrentLoad();
  const endTimestamp =
    metadataEndTimestamp ?? (await input.computeDuration(tracks, { skipLiveWait: true }));
  assertCurrentLoad();

  if (videoTrack !== null) {
    const videoCodec = await videoTrack.getCodec();
    assertCurrentLoad();
    const videoDecodable = await videoTrack.canDecode();
    assertCurrentLoad();
    if (videoCodec === null || !videoDecodable) {
      throw new Error(`The browser cannot decode the video track for source "${source.sourceId}".`);
    }

    const alpha = await videoTrack.canBeTransparent();
    assertCurrentLoad();
    controller.videoSink = new mediabunny.CanvasSink(videoTrack, {
      poolSize: 2,
      fit: 'contain',
      alpha,
    });
  }

  let audioDecodable = false;
  if (audioTrack !== null) {
    const audioCodec = await audioTrack.getCodec();
    assertCurrentLoad();
    audioDecodable = await audioTrack.canDecode();
    assertCurrentLoad();
    audioDecodable = audioCodec !== null && audioDecodable;
  }
  if (audioTrack !== null && videoTrack === null && !audioDecodable) {
    throw new Error(`The browser cannot decode the audio track for source "${source.sourceId}".`);
  }

  const [videoMetadata, audioMetadata] = await Promise.all([
    videoTrack === null
      ? null
      : Promise.all([
          videoTrack.getDisplayWidth(),
          videoTrack.getDisplayHeight(),
          videoTrack.getRotation(),
          videoTrack.computePacketStats(100, { skipLiveWait: true }).catch(() => null),
        ]).then(([displayWidth, displayHeight, rotation, packetStats]) => ({
          displayWidth,
          displayHeight,
          rotation,
          detectedFrameRate: packetStats?.averagePacketRate || null,
        })),
    audioTrack === null || !audioDecodable
      ? null
      : audioTrack.getSampleRate().then((sampleRate) => ({ sampleRate })),
  ]);
  assertCurrentLoad();

  if (audioTrack !== null && audioDecodable) {
    assertCurrentLoad();
    controller.audioSink = new mediabunny.AudioBufferSink(audioTrack);
    if (!deferAudioRuntime) {
      const audioRuntime = ensureAudioRuntime(false);
      if (audioRuntime === null) {
        controller.audioSink = null;
      } else {
        controller.audioContext = audioRuntime.context;
        controller.gainNode = audioRuntime.gainNode;
      }
    }
  }

  return {
    metadata: {
      firstTimestampSeconds: firstTimestamp,
      sourceFirstTimestampSeconds: toLogicalSourceSeconds(controller, firstTimestamp),
      presentationStartTimestampSeconds: presentationStartTimestamp,
      endTimestampSeconds: endTimestamp,
      sourceEndTimestampSeconds: toLogicalSourceSeconds(controller, endTimestamp),
      durationSeconds: Math.max(0, endTimestamp - presentationStartTimestamp),
      video: videoMetadata,
      audio: audioMetadata,
    },
  };
}

async function createInput(
  mediabunny: MediabunnyModule,
  sourceInput: MediabunnySourceInput
): Promise<Mediabunny.Input> {
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input') {
    return sourceInput.input;
  }
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input-factory') {
    return sourceInput.createInput(mediabunny);
  }
  if (isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'url') {
    return new mediabunny.Input({
      source: new mediabunny.UrlSource(sourceInput.url, sourceInput.urlSourceOptions),
      formats: [...(sourceInput.formats ?? mediabunny.ALL_FORMATS)],
    });
  }

  if (
    typeof sourceInput === 'string' ||
    sourceInput instanceof URL ||
    sourceInput instanceof Request
  ) {
    return new mediabunny.Input({
      source: new mediabunny.UrlSource(sourceInput),
      formats: [...mediabunny.ALL_FORMATS],
    });
  }

  const mediabunnyWithBlobSource = mediabunny as MediabunnyModule & {
    BlobSource?: new (
      blob: Blob | File
    ) => ConstructorParameters<MediabunnyModule['Input']>[0]['source'];
  };

  if (mediabunnyWithBlobSource.BlobSource === undefined) {
    throw new Error('This Mediabunny version does not expose BlobSource for local files.');
  }

  return new mediabunny.Input({
    source: new mediabunnyWithBlobSource.BlobSource(sourceInput),
    formats: mediabunny.ALL_FORMATS,
  });
}

type MediabunnyInputDescriptor = Exclude<
  MediabunnySourceInput,
  string | URL | Request | Blob | File
>;

function isMediabunnyInputDescriptor(
  sourceInput: MediabunnySourceInput
): sourceInput is MediabunnyInputDescriptor {
  return (
    typeof sourceInput !== 'string' &&
    !(sourceInput instanceof URL) &&
    !(sourceInput instanceof Request) &&
    !(sourceInput instanceof Blob)
  );
}

function isSuppliedMediabunnyInput(sourceInput: MediabunnySourceInput) {
  return isMediabunnyInputDescriptor(sourceInput) && sourceInput.kind === 'input';
}
