import { XMLParser } from 'fast-xml-parser';
import { readZipEntries } from './zip.util';

export type PptSlideContent = {
  pageNumber: number;
  title: string;
  textBlocks: string[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectTextTokens(node: unknown, acc: string[]): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectTextTokens(item, acc));
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    if (key === 'a:t') {
      if (typeof value === 'string') {
        const normalized = value.replace(/\s+/g, ' ').trim();
        if (normalized) {
          acc.push(normalized);
        }
      }
      return;
    }

    collectTextTokens(value, acc);
  });
}

function collectParagraphs(node: unknown, acc: string[]): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectParagraphs(item, acc));
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    if (key === 'a:p') {
      asArray(value).forEach((paragraph) => {
        const tokens: string[] = [];
        collectTextTokens(paragraph, tokens);
        const paragraphText = tokens.join(' ').replace(/\s+/g, ' ').trim();
        if (paragraphText) {
          acc.push(paragraphText);
        }
      });
      return;
    }

    collectParagraphs(value, acc);
  });
}

function extractSlideIndex(fileName: string): number {
  const match = fileName.match(/slide(\d+)\.xml$/i);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

export async function extractSlidesFromPptxBuffer(
  sourceBuffer: Buffer,
): Promise<PptSlideContent[]> {
  const zipEntries = await readZipEntries(sourceBuffer);
  const slideEntryNames = Array.from(zipEntries.keys())
    .filter((fileName) => /^ppt\/slides\/slide\d+\.xml$/i.test(fileName))
    .sort((a, b) => extractSlideIndex(a) - extractSlideIndex(b));

  const slides: PptSlideContent[] = [];

  slideEntryNames.forEach((entryName, index) => {
    const entryBuffer = zipEntries.get(entryName);
    if (!entryBuffer) {
      return;
    }

    const slideXml = entryBuffer.toString('utf8');
    const parsedXml = parser.parse(slideXml);
    const textBlocks: string[] = [];
    collectParagraphs(parsedXml, textBlocks);

    const dedupedTextBlocks = textBlocks.filter(
      (value, textIndex) => value && textBlocks.indexOf(value) === textIndex,
    );

    slides.push({
      pageNumber: index + 1,
      title: dedupedTextBlocks[0] ?? `Slide ${index + 1}`,
      textBlocks: dedupedTextBlocks,
    });
  });

  return slides;
}
