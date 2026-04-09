import yauzl from 'yauzl';
import yazl from 'yazl';

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export async function readZipEntries(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true },
      (openError, zipFile) => {
        if (openError || !zipFile) {
          reject(openError ?? new Error('Failed to open zip buffer'));
          return;
        }

        const entries = new Map<string, Buffer>();

        zipFile.readEntry();

        zipFile.on('entry', (entry: yauzl.Entry) => {
          if (entry.fileName.endsWith('/')) {
            zipFile.readEntry();
            return;
          }

          zipFile.openReadStream(entry, (streamError, readStream) => {
            if (streamError || !readStream) {
              reject(streamError ?? new Error('Failed to open zip entry stream'));
              return;
            }

            void streamToBuffer(readStream)
              .then((entryBuffer) => {
                entries.set(entry.fileName, entryBuffer);
                zipFile.readEntry();
              })
              .catch(reject);
          });
        });

        zipFile.on('end', () => resolve(entries));
        zipFile.on('error', reject);
      },
    );
  });
}

export async function writeZipEntries(entries: Map<string, Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zipFile = new yazl.ZipFile();
    const outputStream = zipFile.outputStream;
    const chunks: Buffer[] = [];

    outputStream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    outputStream.on('error', reject);

    Array.from(entries.keys())
      .sort((a, b) => a.localeCompare(b))
      .forEach((fileName) => {
        const content = entries.get(fileName);
        if (content) {
          zipFile.addBuffer(content, fileName);
        }
      });

    zipFile.end();
  });
}
