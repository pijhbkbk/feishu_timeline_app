import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      service: 'feishu-timeline-web',
      runtimeCommit: process.env.RUNTIME_COMMIT?.trim() || 'unknown',
      buildTime: process.env.BUILD_TIME?.trim() || 'unknown',
      release: process.env.RELEASE?.trim() || 'development',
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
