import { NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from './lib/session'

export async function middleware(req) {
  const isAuthenticated = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
  const { pathname } = req.nextUrl

  // Toutes les pages /app exigent une session valide (cookie signé).
  if (pathname.startsWith('/app')) {
    if (isAuthenticated) return NextResponse.next()
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(isAuthenticated ? '/app/dashboard' : '/login', req.url))
  }

  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/app/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = { matcher: ['/', '/login', '/app/:path*'] }
