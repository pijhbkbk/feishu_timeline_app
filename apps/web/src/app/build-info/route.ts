import { NextResponse } from 'next/server';

import {
  createBuildInfoPayload,
} from '../../lib/build-identity';

export const dynamic = 'force-dynamic';

function createBuildInfoResponse() {
  const payload = createBuildInfoPayload();

  return NextResponse.json(
    {
      ...payload,
      runtimeCommit: payload.sourceCommit,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}

export function GET() {
  return createBuildInfoResponse();
}
