import { NextResponse } from 'next/server'

export function middleware(req) {
  const sessionCookie = req.cookies.get('dash_auto_session')
  const isAuthenticated = sessionCookie?.value === 'authenticated'

  // We require auth for paths starting with /app
  if (req.nextUrl.pathname.startsWith('/app')) {
    if (isAuthenticated) {
      return NextResponse.next()
    }
    
    // Redirect to login if not authenticated
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Redirect to login instead of root landing page if not authenticated
  if (req.nextUrl.pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // If going to /login but already authenticated, redirect to /app/dashboard
  if (req.nextUrl.pathname === '/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
  }

  return NextResponse.next()
}
