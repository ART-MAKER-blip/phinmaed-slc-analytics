import { NextResponse } from 'next/server';
import { handleImportRequest } from '@/lib/imports/api';
import { createGradeBatch, ImportError, MAX_FILE_BYTES } from '@/lib/imports/server';

export async function POST(request: Request) {
  return handleImportRequest('import.upload', async (user) => {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_FILE_BYTES + 64 * 1024) throw new ImportError('The file is larger than 10 MB.', 413);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ImportError('Invalid upload.');
    }
    const file = form.get('file');
    if (!(file instanceof File)) throw new ImportError('Choose a file to upload.');
    const ids = ['campusId', 'termId', 'periodId'].map((key) => Number(form.get(key)));
    if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) throw new ImportError('Choose a campus, term and period.');

    const result = await createGradeBatch({
      user,
      file: { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
      campusId: ids[0],
      termId: ids[1],
      periodId: ids[2],
    });
    return NextResponse.json(result, { status: 201 });
  });
}
