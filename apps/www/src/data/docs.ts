export const docsSectionIds = ['intro', 'concepts', 'packages', 'demos', 'reference'] as const;

export type DocsSectionId = (typeof docsSectionIds)[number];

export const docsSections: {
  id: DocsSectionId;
  title: string;
  description: string;
}[] = [
  {
    id: 'intro',
    title: 'Start here',
    description: 'Install the package family and render your first timeline.',
  },
  {
    id: 'concepts',
    title: 'Concepts',
    description: 'Understand timeline state, tracks, clips, markers, and rendering.',
  },
  {
    id: 'packages',
    title: 'Packages',
    description: 'Choose the right package entrypoint for your integration.',
  },
  {
    id: 'demos',
    title: 'Demos',
    description: 'Explore source-backed examples for common timeline integrations.',
  },
  {
    id: 'reference',
    title: 'Reference',
    description: 'Generated API surfaces and low-level package details.',
  },
];

export type OrderedDoc = {
  id: string;
  data: {
    order: number;
    section: DocsSectionId;
    title: string;
    description: string;
  };
};

function sortDocs<T extends OrderedDoc>(docs: T[]) {
  return [...docs].sort((a, b) => a.data.order - b.data.order);
}

export function docsForSection<T extends OrderedDoc>(docs: T[], sectionId: DocsSectionId) {
  return sortDocs(docs.filter((entry) => entry.data.section === sectionId));
}

export function adjacentDocs<T extends OrderedDoc>(docs: T[], currentId: string) {
  const orderedDocs = sortDocs(docs);
  const currentIndex = orderedDocs.findIndex((entry) => entry.id === currentId);

  return {
    previous: currentIndex > 0 ? orderedDocs[currentIndex - 1] : undefined,
    next:
      currentIndex >= 0 && currentIndex < orderedDocs.length - 1
        ? orderedDocs[currentIndex + 1]
        : undefined,
  };
}
