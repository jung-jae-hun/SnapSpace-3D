import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { backendUrl } from '../../../../../../lib/backend'
import { forwardProxyJson, proxyRequestFailed } from '../../../../../../lib/proxy-response'

type RouteParams = {
  generationId: string
  action?: string[]
}

function resolveActionPath(generationId: string, action?: string[]): string | null {
  if (!action || action.length === 0) {
    return `/ai/generations/${generationId}`
  }

  if (action.length === 1 && (action[0] === 'cancel' || action[0] === 'promote')) {
    return `/ai/generations/${generationId}/${action[0]}`
  }

  return null
}

async function resolveAccessToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim()
  }

  const cookieStore = await cookies()
  return cookieStore.get('snapspace_access_token')?.value ?? null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { generationId, action } = await params
  const targetPath = resolveActionPath(generationId, action)

  if (!targetPath || (action && action.length > 0)) {
    return new Response('Not Found', { status: 404 })
  }

  const accessToken = await resolveAccessToken(req)
  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const response = await fetch(backendUrl(targetPath), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: 'no-store'
    })

    return forwardProxyJson(response)
  } catch (error) {
    return proxyRequestFailed(error, targetPath)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { generationId, action } = await params
  const targetPath = resolveActionPath(generationId, action)

  if (!targetPath || !action || action.length !== 1) {
    return new Response('Not Found', { status: 404 })
  }

  const accessToken = await resolveAccessToken(req)
  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const contentType = req.headers.get('content-type')
    const bodyText = await req.text()
    const response = await fetch(backendUrl(targetPath), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(contentType ? { 'Content-Type': contentType } : {})
      },
      body: bodyText.length > 0 ? bodyText : undefined,
      cache: 'no-store'
    })

    return forwardProxyJson(response)
  } catch (error) {
    return proxyRequestFailed(error, targetPath)
  }
}
