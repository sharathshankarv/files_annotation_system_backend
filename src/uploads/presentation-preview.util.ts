import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, parse } from 'path';
import { spawn } from 'child_process';

const LIBREOFFICE_CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  'soffice',
  'soffice.com',
  'soffice.exe',
].filter(Boolean) as string[];
const GOTENBERG_URL = process.env.GOTENBERG_URL?.replace(/\/+$/, '');

function runBinary(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Conversion timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim() ||
            `LibreOffice process exited with code ${String(code)}`,
        ),
      );
    });
  });
}

function isPreviewFresh(sourcePath: string, previewPath: string): boolean {
  if (!existsSync(sourcePath) || !existsSync(previewPath)) {
    return false;
  }

  const sourceMtime = statSync(sourcePath).mtimeMs;
  const previewMtime = statSync(previewPath).mtimeMs;
  return previewMtime >= sourceMtime;
}

export function resolvePresentationPreviewPath(sourceAbsolutePath: string): string {
  const sourceDir = dirname(sourceAbsolutePath);
  const sourceName = parse(sourceAbsolutePath).name;
  return join(sourceDir, 'previews', `${sourceName}.preview.pdf`);
}

export async function ensurePresentationPdfPreview(
  sourceAbsolutePath: string,
  previewAbsolutePath: string,
): Promise<boolean> {
  if (!existsSync(sourceAbsolutePath)) {
    return false;
  }

  if (isPreviewFresh(sourceAbsolutePath, previewAbsolutePath)) {
    return true;
  }

  const inputBuffer = readFileSync(sourceAbsolutePath);
  const sourceFileName = basename(sourceAbsolutePath);

  if (GOTENBERG_URL) {
    try {
      const form = new FormData();
      form.append(
        'files',
        new Blob([inputBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }),
        sourceFileName,
      );

      const response = await fetch(`${GOTENBERG_URL}/forms/libreoffice/convert`, {
        method: 'POST',
        body: form,
      });

      if (response.ok) {
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > 0) {
          mkdirSync(dirname(previewAbsolutePath), { recursive: true });
          writeFileSync(previewAbsolutePath, data);
          return true;
        }
      }
    } catch {
      // Fallback to local LibreOffice conversion below.
    }
  }

  const workingDir = mkdtempSync(join(tmpdir(), 'ppt-preview-'));
  const tempInputPath = join(workingDir, basename(sourceAbsolutePath));
  const tempOutputPath = join(workingDir, `${parse(tempInputPath).name}.pdf`);
  copyFileSync(sourceAbsolutePath, tempInputPath);

  const args = [
    '--headless',
    '--nologo',
    '--nolockcheck',
    '--nodefault',
    '--nofirststartwizard',
    '--convert-to',
    'pdf',
    '--outdir',
    workingDir,
    tempInputPath,
  ];

  try {
    let converted = false;

    for (const binary of LIBREOFFICE_CANDIDATES) {
      try {
        await runBinary(binary, args, 90_000);
        converted = true;
        break;
      } catch {
        // Try next candidate.
      }
    }

    if (!converted || !existsSync(tempOutputPath)) {
      return false;
    }

    mkdirSync(dirname(previewAbsolutePath), { recursive: true });
    copyFileSync(tempOutputPath, previewAbsolutePath);
    return true;
  } finally {
    rmSync(workingDir, { recursive: true, force: true });
  }
}
