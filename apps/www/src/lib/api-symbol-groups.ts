import { timelineHookMetadata } from '@techsquidtv/canvas-timeline-react/docs-metadata';
import type { ApiSymbol } from './api-reference';

const timelineHookNames: ReadonlySet<string> = new Set(
  timelineHookMetadata.map((hook) => hook.name)
);

const apiGroupOrder = [
  'Hooks',
  'Timeline Hooks',
  'Primitive Hooks',
  'Class',
  'Interface',
  'Type Alias',
  'Variable',
  'Function',
];

export function groupNameForApiSymbol(packageSlug: string, symbol: ApiSymbol) {
  if (
    (packageSlug === 'react' || packageSlug === 'timeline') &&
    symbol.kind === 'Function' &&
    symbol.name.startsWith('use')
  ) {
    if (packageSlug === 'timeline') {
      return 'Hooks';
    }

    return timelineHookNames.has(symbol.name) ? 'Timeline Hooks' : 'Primitive Hooks';
  }

  return symbol.kind;
}

function compareApiGroupNames(groupA: string, groupB: string) {
  const indexA = apiGroupOrder.indexOf(groupA);
  const indexB = apiGroupOrder.indexOf(groupB);

  if (indexA !== -1 || indexB !== -1) {
    return (
      (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) -
      (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB)
    );
  }

  return groupA.localeCompare(groupB);
}

export function groupApiSymbols(packageSlug: string, symbols: ApiSymbol[]) {
  const symbolsByGroup = symbols.reduce<Record<string, ApiSymbol[]>>((groups, symbol) => {
    const groupName = groupNameForApiSymbol(packageSlug, symbol);
    groups[groupName] ??= [];
    groups[groupName].push(symbol);
    return groups;
  }, {});

  return Object.entries(symbolsByGroup).sort(([groupA], [groupB]) =>
    compareApiGroupNames(groupA, groupB)
  );
}
