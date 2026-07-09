import type {
  Clip,
  TimelineKeyframePropertyDefinition,
  TimelineKeyframePropertyId,
  TimelineRegisteredKeyframePropertyDefinition,
} from '#core/types';
import { assertValidTimelineNumber, cloneTimelineKeyframes } from '#core/snapshot';

export class KeyframePropertyRegistry {
  private properties = new Map<
    TimelineKeyframePropertyId,
    TimelineRegisteredKeyframePropertyDefinition
  >();

  register(definition: TimelineKeyframePropertyDefinition) {
    if (this.properties.has(definition.id)) {
      throw new RangeError(`Keyframe property "${definition.id}" is already registered.`);
    }
    this.assertValidDefinition(definition);
    this.properties.set(definition.id, this.createRegisteredProperty(definition));
  }

  registerMany(definitions: TimelineKeyframePropertyDefinition[]) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  get(property: TimelineKeyframePropertyId): TimelineRegisteredKeyframePropertyDefinition | null {
    return this.properties.get(property) ?? null;
  }

  has(property: TimelineKeyframePropertyId) {
    return this.properties.has(property);
  }

  list(): TimelineRegisteredKeyframePropertyDefinition[] {
    return Array.from(this.properties.values());
  }

  clampValue(property: TimelineKeyframePropertyId, value: number): number | null {
    const definition = this.get(property);
    if (!definition) {
      return null;
    }
    return this.clampDefinitionValue(definition, value, 'value');
  }

  normalizeValue(property: TimelineKeyframePropertyId, value: number): number | null {
    const definition = this.get(property);
    if (!definition) {
      return null;
    }
    return this.normalizeDefinitionValue(definition, value, 'value');
  }

  normalizeClipKeyframes(clip: Clip) {
    if (clip.keyframes === undefined) {
      return;
    }

    clip.keyframes = cloneTimelineKeyframes(clip.keyframes).map((keyframe) => {
      const value = this.clampValue(keyframe.property, keyframe.value);
      if (value === null) {
        throw new RangeError(`Unregistered keyframe property "${keyframe.property}".`);
      }
      return { ...keyframe, value };
    });
  }

  clampDefinitionValue(
    definition: Pick<TimelineKeyframePropertyDefinition, 'id' | 'min' | 'max' | 'clampValue'>,
    value: number,
    label: string
  ): number {
    assertValidTimelineNumber(value, label);
    const clamped = definition.clampValue(value);
    assertValidTimelineNumber(clamped, `${label} clampValue result`);
    if (clamped < definition.min || clamped > definition.max) {
      throw new RangeError(
        `keyframe property "${definition.id}".clampValue must return a value within min/max.`
      );
    }
    return clamped;
  }

  normalizeDefinitionValue(
    definition: Pick<
      TimelineKeyframePropertyDefinition,
      'id' | 'min' | 'max' | 'clampValue' | 'normalizeValue'
    >,
    value: number,
    label: string
  ): number {
    const clamped = this.clampDefinitionValue(definition, value, label);
    const normalized = definition.normalizeValue(clamped);
    assertValidTimelineNumber(normalized, `${label} normalizeValue result`);
    if (normalized < 0 || normalized > 1) {
      throw new RangeError(
        `keyframe property "${definition.id}".normalizeValue must return a value between 0 and 1.`
      );
    }
    return normalized;
  }

  denormalizeDefinitionValue(
    definition: Pick<
      TimelineKeyframePropertyDefinition,
      'id' | 'min' | 'max' | 'clampValue' | 'denormalizeValue'
    >,
    normalized: number,
    label: string
  ): number {
    assertValidTimelineNumber(normalized, label);
    if (normalized < 0 || normalized > 1) {
      throw new RangeError(`${label} must be between 0 and 1.`);
    }
    const denormalized = definition.denormalizeValue(normalized);
    assertValidTimelineNumber(denormalized, `${label} denormalizeValue result`);
    if (denormalized < definition.min || denormalized > definition.max) {
      throw new RangeError(
        `keyframe property "${definition.id}".denormalizeValue must return a value within min/max.`
      );
    }
    return this.clampDefinitionValue(definition, denormalized, label);
  }

  private createRegisteredProperty(
    definition: TimelineKeyframePropertyDefinition
  ): TimelineRegisteredKeyframePropertyDefinition {
    const defaultValue = this.clampDefinitionValue(
      definition,
      definition.defaultValue,
      `keyframe property "${definition.id}".defaultValue`
    );
    return Object.freeze({
      id: definition.id,
      ...(definition.label === undefined ? {} : { label: definition.label }),
      min: definition.min,
      max: definition.max,
      defaultValue,
      clampValue: definition.clampValue,
      normalizeValue: definition.normalizeValue,
      denormalizeValue: definition.denormalizeValue,
      ...(definition.formatValue === undefined ? {} : { formatValue: definition.formatValue }),
      ...(definition.getBaseValue === undefined ? {} : { getBaseValue: definition.getBaseValue }),
    });
  }

  private assertValidDefinition(definition: TimelineKeyframePropertyDefinition) {
    assertValidTimelineNumber(definition.min, `keyframe property "${definition.id}".min`);
    assertValidTimelineNumber(definition.max, `keyframe property "${definition.id}".max`);
    assertValidTimelineNumber(
      definition.defaultValue,
      `keyframe property "${definition.id}".defaultValue`
    );
    if (definition.max <= definition.min) {
      throw new RangeError(`keyframe property "${definition.id}".max must be greater than min.`);
    }

    const clampedDefault = this.clampDefinitionValue(
      definition,
      definition.defaultValue,
      `keyframe property "${definition.id}".defaultValue`
    );
    this.normalizeDefinitionValue(
      definition,
      clampedDefault,
      `keyframe property "${definition.id}".normalizeValue(defaultValue)`
    );
    this.normalizeDefinitionValue(
      definition,
      definition.min,
      `keyframe property "${definition.id}".normalizeValue(min)`
    );
    this.normalizeDefinitionValue(
      definition,
      definition.max,
      `keyframe property "${definition.id}".normalizeValue(max)`
    );
    this.denormalizeDefinitionValue(
      definition,
      0,
      `keyframe property "${definition.id}".denormalizeValue(0)`
    );
    this.denormalizeDefinitionValue(
      definition,
      1,
      `keyframe property "${definition.id}".denormalizeValue(1)`
    );
  }
}
