import { PDFDocument, PDFName, PDFPage, StandardFonts, rgb } from 'pdf-lib';

type PdfAnnotationInput = {
  comment: string;
  authorName?: string | null;
  highlightColor?: string | null;
  page: number;
  normalizedX: number | null;
  normalizedY: number | null;
  normalizedWidth: number | null;
  normalizedHeight: number | null;
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function parseHexColor(value: string | null | undefined): {
  r: number;
  g: number;
  b: number;
} {
  const fallback = { r: 0.99, g: 0.94, b: 0.2 };
  if (!value || !/^#([0-9A-Fa-f]{6})$/.test(value)) {
    return fallback;
  }

  const raw = value.slice(1);
  const r = Number.parseInt(raw.slice(0, 2), 16) / 255;
  const g = Number.parseInt(raw.slice(2, 4), 16) / 255;
  const b = Number.parseInt(raw.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function tintColor(
  color: { r: number; g: number; b: number },
  factor: number,
): { r: number; g: number; b: number } {
  return {
    r: color.r + (1 - color.r) * factor,
    g: color.g + (1 - color.g) * factor,
    b: color.b + (1 - color.b) * factor,
  };
}

function wrapTextByWidth(
  text: string,
  maxWidth: number,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  fontSize: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [''];
}

export async function applyAnnotationsToPdfBuffer(
  originalBuffer: Buffer,
  annotations: PdfAnnotationInput[],
): Promise<Buffer> {
  if (!annotations.length) {
    return originalBuffer;
  }

  const pdf = await PDFDocument.load(originalBuffer);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const validItems: Array<
    PdfAnnotationInput & { pageIndex: number; markerNumber: number }
  > = [];

  annotations.forEach((annotation) => {
    const pageIndex = annotation.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return;
    }

    validItems.push({
      ...annotation,
      pageIndex,
      markerNumber: validItems.length + 1,
    });
  });

  const hasRightEdgeTouches = validItems.some((item) => {
    const x = clamp01(item.normalizedX ?? 0.05);
    const w = clamp01(item.normalizedWidth ?? 0.08);
    return x + w >= 0.88;
  });
  const gutterPercent = hasRightEdgeTouches ? 0.08 : 0.12;
  const maxBaseWidth = pages.reduce(
    (max, page) => Math.max(max, page.getSize().width),
    0,
  );
  const fixedGutterWidth = Math.max(maxBaseWidth * gutterPercent, 72);
  const fixedPageWidth = maxBaseWidth + fixedGutterWidth;
  const pageBaseWidthByIndex = new Map<number, number>();

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    pageBaseWidthByIndex.set(index, width);
    page.setSize(fixedPageWidth, height);
  });

  const pageItemMap = new Map<number, typeof validItems>();
  validItems.forEach((item) => {
    const existing = pageItemMap.get(item.pageIndex) ?? [];
    existing.push(item);
    pageItemMap.set(item.pageIndex, existing);
  });

  const overflowItems: Array<PdfAnnotationInput & { markerNumber: number }> = [];
  const markerPositions = new Map<
    number,
    { page: PDFPage; x: number; y: number; width: number; height: number }
  >();
  const markerToOverflowTarget = new Map<
    number,
    { page: PDFPage; x: number; y: number }
  >();
  const markerLinkOrigins: Array<{
    markerNumber: number;
    page: PDFPage;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];

  const addGoToLink = (
    page: PDFPage,
    rect: { x: number; y: number; width: number; height: number },
    destination: { page: PDFPage; x: number; y: number },
  ) => {
    if (!page || !destination.page) {
      return;
    }

    const destinationPage = destination.page;
    const destinationArray = pdf.context.obj([
      destinationPage.ref,
      PDFName.of('XYZ'),
      Math.max(destination.x, 0),
      Math.max(destination.y, 0),
      0,
    ]);
    const link = pdf.context.obj({
      Type: PDFName.of('Annot'),
      Subtype: PDFName.of('Link'),
      Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
      Border: [0, 0, 0],
      Dest: pdf.context.obj([destinationPage.ref, PDFName.of('Fit')]),
    });
    const linkRef = pdf.context.register(link);
    page.node.addAnnot(linkRef);
  };

  validItems.forEach((annotation) => {
    const page = pages[annotation.pageIndex];
    const { height } = page.getSize();
    const originalWidth =
      pageBaseWidthByIndex.get(annotation.pageIndex) ?? fixedPageWidth;
    const contentRightBoundary = originalWidth - 6;

    const normalizedX = clamp01(annotation.normalizedX ?? 0.05);
    const normalizedY = clamp01(annotation.normalizedY ?? 0.05);
    const normalizedWidth = clamp01(annotation.normalizedWidth ?? 0.1);
    const normalizedHeight = clamp01(annotation.normalizedHeight ?? 0.02);

    const boxX = Math.min(normalizedX * originalWidth, contentRightBoundary - 12);
    const boxYTop = normalizedY * height;
    const boxHeight = Math.max(normalizedHeight * height, 8);
    const boxWidth = Math.max(
      Math.min(normalizedWidth * originalWidth, contentRightBoundary - boxX),
      12,
    );
    const boxY = height - boxYTop - boxHeight;
    const highlightColor = parseHexColor(annotation.highlightColor);

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: rgb(highlightColor.r, highlightColor.g, highlightColor.b),
      opacity: 0.4,
      borderWidth: 0,
    });

    const markerRadius = 7;
    const markerX = Math.min(contentRightBoundary - 6, boxX + boxWidth + 6);
    const markerY = Math.min(Math.max(boxY + boxHeight / 2, 14), height - 14);

    page.drawCircle({
      x: markerX,
      y: markerY,
      size: markerRadius,
      color: rgb(0.1, 0.45, 0.9),
      opacity: 0.9,
    });

    page.drawText(String(annotation.markerNumber), {
      x: markerX - 3.2,
      y: markerY - 3,
      size: 7,
      font,
      color: rgb(1, 1, 1),
    });

    markerPositions.set(annotation.markerNumber, {
      page,
      x: boxX,
      y: Math.max(Math.min(boxY + boxHeight + 12, height - 8), 8),
      width: boxWidth,
      height: boxHeight,
    });
    markerLinkOrigins.push({
      markerNumber: annotation.markerNumber,
      page,
      x: markerX - markerRadius,
      y: markerY - markerRadius,
      width: markerRadius * 2,
      height: markerRadius * 2,
    });
  });

  pageItemMap.forEach((items, pageIndex) => {
    const page = pages[pageIndex];
    const { width, height } = page.getSize();
    const baseWidth = width - fixedGutterWidth;
    const gutterX = baseWidth;
    const gutterWidth = fixedGutterWidth;
    const innerPadding = 10;
    const textSize = 6.5;
    const titleSize = 7.2;
    const lineHeight = 9;
    const maxTextWidth = gutterWidth - innerPadding * 2;

    page.drawRectangle({
      x: gutterX,
      y: 0,
      width: gutterWidth,
      height,
      color: rgb(1, 1, 1),
      opacity: 0.95,
      borderColor: rgb(0.84, 0.88, 0.94),
      borderWidth: 0.7,
    });

    page.drawText('Notes', {
      x: gutterX + innerPadding,
      y: height - 10,
      size: titleSize,
      font,
      color: rgb(0.1, 0.18, 0.32),
    });

    const sorted = [...items].sort(
      (a, b) => (a.normalizedY ?? 0) - (b.normalizedY ?? 0),
    );
    const occupiedBands: Array<{ top: number; bottom: number }> = [];
    const noteGap = 10;
    const topPadding = 20;
    const bottomPadding = 20;
    const dynamicMaxLines = Math.max(
      4,
      Math.min(
        12,
        Math.floor(
          (height - topPadding - bottomPadding) /
            Math.max(items.length, 1) /
            lineHeight,
        ),
      ),
    );

    sorted.forEach((item) => {
      const note = item.comment.trim() || '(No comment)';
      const author = item.authorName?.trim() || 'Unknown';
      const fullWrapped = wrapTextByWidth(
        `${item.markerNumber}. ${note}`,
        maxTextWidth,
        font,
        textSize,
      );
      const wrapped = fullWrapped.slice(0, dynamicMaxLines);
      const isTruncated = fullWrapped.length > wrapped.length;
      if (isTruncated) {
        wrapped[wrapped.length - 1] = `${wrapped[wrapped.length - 1]} ...`;
      }
      const noteHeight = wrapped.length * lineHeight + 14;
      const targetYTop =
        clamp01((item.normalizedY ?? 0.05) + (item.normalizedX ?? 0) * 0.01) *
        height;
      let yTop = Math.min(
        Math.max(targetYTop, topPadding),
        height - noteHeight - bottomPadding,
      );

      for (const band of occupiedBands) {
        const overlaps = yTop < band.bottom && yTop + noteHeight > band.top;
        if (overlaps) {
          yTop = band.bottom + noteGap;
        }
      }

      if (yTop + noteHeight + noteGap > height - bottomPadding) {
        overflowItems.push(item);
        return;
      }

      yTop = Math.min(
        Math.max(yTop, topPadding),
        height - noteHeight - bottomPadding,
      );
      occupiedBands.push({ top: yTop, bottom: yTop + noteHeight });
      occupiedBands.sort((a, b) => a.top - b.top);
      const baseColor = parseHexColor(item.highlightColor);
      const panelColor = tintColor(baseColor, 0.88);

      page.drawRectangle({
        x: gutterX + 2,
        y: height - yTop - noteHeight,
        width: gutterWidth - 4,
        height: noteHeight,
        color: rgb(panelColor.r, panelColor.g, panelColor.b),
        opacity: 1,
        borderColor: rgb(baseColor.r, baseColor.g, baseColor.b),
        borderWidth: 0.7,
      });

      let textY = height - yTop - lineHeight - 2;
      wrapped.forEach((line) => {
        page.drawText(line, {
          x: gutterX + innerPadding,
          y: textY,
          size: textSize,
          font,
          color: rgb(0.18, 0.18, 0.2),
          maxWidth: maxTextWidth,
        });
        textY -= lineHeight;
      });

      page.drawText(`by ${author}`.slice(0, 32), {
        x: gutterX + innerPadding,
        y: textY - 1,
        size: 6,
        font,
        color: rgb(0.24, 0.24, 0.28),
        maxWidth: maxTextWidth,
      });
      textY -= 8;

      if (isTruncated) {
        page.drawText(`See full #${item.markerNumber} at end`, {
          x: gutterX + innerPadding,
          y: textY - 1,
          size: 6,
          font,
          color: rgb(0.28, 0.35, 0.55),
          maxWidth: maxTextWidth,
        });
        markerLinkOrigins.push({
          markerNumber: item.markerNumber,
          page,
          x: gutterX + innerPadding,
          y: textY - 3,
          width: Math.max(maxTextWidth - 4, 28),
          height: 9,
        });
        markerLinkOrigins.push({
          markerNumber: item.markerNumber,
          page,
          x: gutterX + 2,
          y: height - yTop - noteHeight,
          width: gutterWidth - 4,
          height: noteHeight,
        });
        overflowItems.push(item);
      }
    });
  });

  if (overflowItems.length) {
    const firstPage = pages[0];
    const fallbackSize = firstPage?.getSize() ?? {
      width: fixedPageWidth,
      height: 842,
    };
    let page = pdf.addPage([fallbackSize.width, fallbackSize.height]);
    let cursorY = fallbackSize.height - 48;
    const titleSize = 14;
    const bodySize = 9;
    const lineHeight = 13;
    const marginX = 56;
    const maxWidth = fallbackSize.width - marginX * 2;

    page.drawText('Overflow Comments', {
      x: marginX,
      y: cursorY,
      size: titleSize,
      font,
      color: rgb(0.12, 0.12, 0.15),
    });
    cursorY -= 22;

    overflowItems.forEach((item, index) => {
      const author = item.authorName?.trim() || 'Unknown';
      const text = `${item.markerNumber}. Page ${item.page}: ${
        item.comment.trim() || '(No comment)'
      }`;
      const wrapped = wrapTextByWidth(text, maxWidth, font, bodySize);
      const neededHeight = wrapped.length * lineHeight + 42;

      if (cursorY - neededHeight < 24) {
        page = pdf.addPage([fallbackSize.width, fallbackSize.height]);
        cursorY = fallbackSize.height - 36;
      }

      const baseColor = parseHexColor(item.highlightColor);
      const bg = tintColor(baseColor, 0.9);
      page.drawRectangle({
        x: marginX - 14,
        y: cursorY - neededHeight + 10,
        width: maxWidth + 28,
        height: neededHeight,
        color: rgb(bg.r, bg.g, bg.b),
        borderColor: rgb(baseColor.r, baseColor.g, baseColor.b),
        borderWidth: 0.6,
      });

      const headerY = cursorY - 2;
      page.drawText(`Comment #${item.markerNumber} (Page ${item.page})`, {
        x: marginX,
        y: headerY,
        size: 8.5,
        font,
        color: rgb(0.14, 0.2, 0.38),
      });
      markerToOverflowTarget.set(item.markerNumber, {
        page,
        x: marginX - 4,
        y: Math.max(headerY + 12, 10),
      });
      cursorY -= 12;

      wrapped.forEach((line) => {
        page.drawText(line, {
          x: marginX,
          y: cursorY - 2,
          size: bodySize,
          font,
          color: rgb(0.18, 0.18, 0.2),
        });
        cursorY -= lineHeight;
      });
      page.drawText(`by ${author}`.slice(0, 64), {
        x: marginX,
        y: cursorY - 2,
        size: 8,
        font,
        color: rgb(0.24, 0.24, 0.28),
        maxWidth,
      });
      cursorY -= 12;
      cursorY -= index % 2 === 0 ? 24 : 26;
    });
  }

  markerLinkOrigins.forEach((origin) => {
    const destination = markerToOverflowTarget.get(origin.markerNumber);
    if (!destination) {
      return;
    }

    addGoToLink(
      origin.page,
      { x: origin.x, y: origin.y, width: origin.width, height: origin.height },
      destination,
    );
  });

  markerToOverflowTarget.forEach((target, markerNumber) => {
    const origin = markerPositions.get(markerNumber);
    if (!origin) {
      return;
    }

    addGoToLink(
      target.page,
      {
        x: Math.max(target.x - 2, 0),
        y: Math.max(target.y - 8, 0),
        width: 170,
        height: 14,
      },
      {
        page: origin.page,
        x: Math.max(origin.x - 8, 0),
        y: origin.y,
      },
    );
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
