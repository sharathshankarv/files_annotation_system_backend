import { readZipEntries, writeZipEntries } from './zip.util';

type DocxAnnotationInput = {
  id: string;
  authorName?: string | null;
  comment: string;
  quotedText: string;
  page: number;
  createdAt: Date;
};

const DOCUMENT_XML_PATH = 'word/document.xml';
const COMMENTS_XML_PATH = 'word/comments.xml';
const RELS_XML_PATH = 'word/_rels/document.xml.rels';
const CONTENT_TYPES_XML_PATH = '[Content_Types].xml';
const COMMENTS_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';
const COMMENTS_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function buildCommentReferenceRun(commentId: number): string {
  return `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${commentId}"/></w:r>`;
}

function buildTextRun(
  runOpenTag: string,
  runPropertiesXml: string,
  text: string,
): string {
  if (!text) {
    return '';
  }

  return `${runOpenTag}${runPropertiesXml}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function splitRunXmlAroundQuote(runXml: string, quote: string): string | null {
  const runOpenTagMatch = runXml.match(/^<w:r\b[^>]*>/);
  if (!runOpenTagMatch) {
    return null;
  }

  const runOpenTag = runOpenTagMatch[0];
  const runPropertiesXml = runXml.match(/<w:rPr[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
  const textMatches = Array.from(runXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g));

  if (!textMatches.length) {
    return null;
  }

  const runText = unescapeXml(textMatches.map((match) => match[1]).join(''));
  const normalizedRunText = normalizeForMatch(runText);
  const normalizedQuote = normalizeForMatch(quote);

  if (!normalizedQuote || !normalizedRunText.includes(normalizedQuote)) {
    return null;
  }

  const directIndex = runText.toLowerCase().indexOf(quote.toLowerCase());
  if (directIndex === -1) {
    return null;
  }

  const before = runText.slice(0, directIndex);
  const selected = runText.slice(directIndex, directIndex + quote.length);
  const after = runText.slice(directIndex + quote.length);

  return [
    buildTextRun(runOpenTag, runPropertiesXml, before),
    selected
      ? [
          `<w:commentRangeStart w:id="__COMMENT_ID__"/>`,
          buildTextRun(runOpenTag, runPropertiesXml, selected),
          `<w:commentRangeEnd w:id="__COMMENT_ID__"/>`,
        ].join('')
      : '',
    buildCommentReferenceRun(-1).replace('w:id="-1"', 'w:id="__COMMENT_ID__"'),
    buildTextRun(runOpenTag, runPropertiesXml, after),
  ].join('');
}

function buildCommentXml(commentId: number, annotation: DocxAnnotationInput): string {
  const commentText = escapeXml(annotation.comment.trim());
  const author = escapeXml(annotation.authorName?.trim() || 'Reviewer');
  const createdAt = annotation.createdAt.toISOString();

  return `<w:comment w:id="${commentId}" w:author="${author}" w:date="${createdAt}"><w:p><w:r><w:t xml:space="preserve">${commentText}</w:t></w:r></w:p></w:comment>`;
}

function ensureCommentsPart(entries: Map<string, Buffer>): string {
  const existing = entries.get(COMMENTS_XML_PATH);
  if (existing) {
    return existing.toString('utf-8');
  }

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:comments>';
}

function getNextCommentId(existingCommentsXml: string): number {
  const ids = Array.from(existingCommentsXml.matchAll(/w:id="(\d+)"/g)).map(
    (match) => Number.parseInt(match[1], 10),
  );

  if (!ids.length) {
    return 0;
  }

  return Math.max(...ids) + 1;
}

type ReplaceRange = {
  start: number;
  end: number;
  replacement: string;
};

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function findSingleRunForQuote(
  runs: Array<{ start: number; end: number; xml: string; text: string }>,
  quote: string,
  usedRunIndexes: Set<number>,
): { index: number } | null {
  const target = normalizeForMatch(quote);
  if (!target) {
    return null;
  }

  for (let index = 0; index < runs.length; index += 1) {
    if (usedRunIndexes.has(index)) {
      continue;
    }

    const runText = normalizeForMatch(runs[index].text);
    if (runText.includes(target)) {
      return { index };
    }
  }

  return null;
}

function injectBeforeBodyEndPreservingSectPr(
  documentXml: string,
  payloadXml: string,
): string {
  const trailingSectionPropertiesPattern =
    /(<w:sectPr[\s\S]*?<\/w:sectPr>\s*)<\/w:body>/;
  const trailingSectionPropertiesMatch = documentXml.match(
    trailingSectionPropertiesPattern,
  );

  if (trailingSectionPropertiesMatch) {
    const sectionProperties = trailingSectionPropertiesMatch[1];
    return documentXml.replace(
      trailingSectionPropertiesPattern,
      `${payloadXml}${sectionProperties}</w:body>`,
    );
  }

  return documentXml.replace('</w:body>', `${payloadXml}</w:body>`);
}

function addCommentAnchorsToDocumentXml(
  documentXml: string,
  annotations: DocxAnnotationInput[],
  startingCommentId: number,
): {
  updatedDocumentXml: string;
  used: Array<{ commentId: number; annotation: DocxAnnotationInput }>;
} {
  const runPattern = /<w:r\b[\s\S]*?<\/w:r>/g;
  const runs: Array<{
    start: number;
    end: number;
    xml: string;
    text: string;
  }> = [];

  let runMatch: RegExpExecArray | null;
  while ((runMatch = runPattern.exec(documentXml)) !== null) {
    const runXml = runMatch[0];
    const textMatches = Array.from(runXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g));
    if (!textMatches.length) {
      continue;
    }

    const runText = unescapeXml(textMatches.map((match) => match[1]).join(''));
    runs.push({
      start: runMatch.index,
      end: runMatch.index + runXml.length,
      xml: runXml,
      text: runText,
    });
  }

  const replacements: ReplaceRange[] = [];
  const usedRunIndexes = new Set<number>();
  const used: Array<{ commentId: number; annotation: DocxAnnotationInput }> = [];
  const unmatchedCommentIds: number[] = [];
  let commentId = startingCommentId;

  for (const annotation of annotations) {
    const quote = annotation.quotedText.trim();
    if (!quote) {
      continue;
    }

    const runMatch = findSingleRunForQuote(runs, quote, usedRunIndexes);
    if (!runMatch) {
      used.push({ commentId, annotation });
      unmatchedCommentIds.push(commentId);
      commentId += 1;
      continue;
    }

    const targetRun = runs[runMatch.index];
    const splitRunXml = splitRunXmlAroundQuote(targetRun.xml, quote);

    if (!splitRunXml) {
      used.push({ commentId, annotation });
      unmatchedCommentIds.push(commentId);
      commentId += 1;
      continue;
    }

    const anchoredRun = splitRunXml.replaceAll(
      '__COMMENT_ID__',
      commentId.toString(),
    );

    replacements.push({
      start: targetRun.start,
      end: targetRun.end,
      replacement: anchoredRun,
    });

    usedRunIndexes.add(runMatch.index);
    used.push({ commentId, annotation });
    commentId += 1;
  }

  const sorted = replacements.sort((a, b) => b.start - a.start);
  let updated = documentXml;

  for (const item of sorted) {
    updated =
      updated.slice(0, item.start) + item.replacement + updated.slice(item.end);
  }

  if (unmatchedCommentIds.length) {
    const markersXml = unmatchedCommentIds
      .map((id) => `<w:p>${buildCommentReferenceRun(id)}</w:p>`)
      .join('');
    updated = injectBeforeBodyEndPreservingSectPr(updated, markersXml);
  }

  return {
    updatedDocumentXml: updated,
    used,
  };
}

function mergeCommentsXml(
  existingCommentsXml: string,
  commentsToInsert: Array<{ commentId: number; annotation: DocxAnnotationInput }>,
): string {
  if (!commentsToInsert.length) {
    return existingCommentsXml;
  }

  const commentNodes = commentsToInsert
    .map((item) => buildCommentXml(item.commentId, item.annotation))
    .join('');

  return existingCommentsXml.replace('</w:comments>', `${commentNodes}</w:comments>`);
}

function ensureCommentsRelationship(relsXml: string): string {
  if (relsXml.includes(COMMENTS_REL_TYPE)) {
    return relsXml;
  }

  const ids = Array.from(relsXml.matchAll(/Id="rId(\d+)"/g)).map((match) =>
    Number.parseInt(match[1], 10),
  );
  const nextRelId = ids.length ? Math.max(...ids) + 1 : 1;
  const relationship = `<Relationship Id="rId${nextRelId}" Type="${COMMENTS_REL_TYPE}" Target="comments.xml"/>`;

  return relsXml.replace('</Relationships>', `${relationship}</Relationships>`);
}

function ensureCommentsContentType(contentTypesXml: string): string {
  if (contentTypesXml.includes('/word/comments.xml')) {
    return contentTypesXml;
  }

  const override = `<Override PartName="/word/comments.xml" ContentType="${COMMENTS_CONTENT_TYPE}"/>`;
  return contentTypesXml.replace('</Types>', `${override}</Types>`);
}

export async function applyAnnotationsToDocxBuffer(
  originalBuffer: Buffer,
  annotations: DocxAnnotationInput[],
): Promise<Buffer> {
  if (!annotations.length) {
    return originalBuffer;
  }

  const entries = await readZipEntries(originalBuffer);
  const documentBuffer = entries.get(DOCUMENT_XML_PATH);
  if (!documentBuffer) {
    return originalBuffer;
  }

  const documentXml = documentBuffer.toString('utf-8');
  const existingCommentsXml = ensureCommentsPart(entries);

  const startingCommentId = getNextCommentId(existingCommentsXml);
  const { updatedDocumentXml, used } = addCommentAnchorsToDocumentXml(
    documentXml,
    annotations,
    startingCommentId,
  );

  if (!used.length) {
    return originalBuffer;
  }

  const updatedCommentsXml = mergeCommentsXml(existingCommentsXml, used);
  entries.set(DOCUMENT_XML_PATH, Buffer.from(updatedDocumentXml, 'utf-8'));
  entries.set(COMMENTS_XML_PATH, Buffer.from(updatedCommentsXml, 'utf-8'));

  const relsBuffer = entries.get(RELS_XML_PATH);
  if (relsBuffer) {
    const relsXml = relsBuffer.toString('utf-8');
    entries.set(RELS_XML_PATH, Buffer.from(ensureCommentsRelationship(relsXml), 'utf-8'));
  }

  const contentTypesBuffer = entries.get(CONTENT_TYPES_XML_PATH);
  if (contentTypesBuffer) {
    const contentTypesXml = contentTypesBuffer.toString('utf-8');
    entries.set(
      CONTENT_TYPES_XML_PATH,
      Buffer.from(ensureCommentsContentType(contentTypesXml), 'utf-8'),
    );
  }

  return writeZipEntries(entries);
}
