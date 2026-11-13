import { NextResponse } from 'next/server';
import { ApiError, handleApi, readJson } from '@/lib/api';
import { resetPassword, updateUser } from '@/lib/admin/server';

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  return handleApi('admin.users', async (user) => {
    if (!/^[0-9a-f-]{36}$/i.test(params.userId)) throw new ApiError('User not found.', 404);
    const body = await readJson(request);
    if (body.action === 'update') return NextResponse.json(await updateUser(user, params.userId, body));
    if (body.action === 'reset_password') return NextResponse.json(await resetPassword(user, params.userId));
    throw new ApiError('Unknown action.');
  });
}
