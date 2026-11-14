import { NextResponse, type NextRequest } from 'next/server';
import { isSameOriginRequest } from '@/lib/same-origin';

// Refuses API requests that change data when they come from another website.
export function middleware(request: NextRequest) {
  if (!isSameOriginRequest(request.method, request.headers)) {
    return NextResponse.json({ error: 'Request blocked: it did not come from this site.' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
