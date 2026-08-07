import { NextResponse } from 'next/server'

export function middleware(req) {
  const basicAuth = req.headers.get('authorization')
  
  // We only require auth for paths starting with /app
  if (req.nextUrl.pathname.startsWith('/app')) {
    const user = process.env.DASHBOARD_USER
    const pwd = process.env.DASHBOARD_PASS
    
    // If auth vars are missing, we log a warning but still block
    if (!user || !pwd) {
      console.warn("DASHBOARD_USER or DASHBOARD_PASS environment variables are not set")
    }

    if (basicAuth) {
      const authValue = basicAuth.split(' ')[1]
      // Basic auth string is base64 encoded "username:password"
      const [providedUser, providedPwd] = atob(authValue).split(':')

      if (providedUser === user && providedPwd === pwd) {
        return NextResponse.next()
      }
    }
    
    // If auth is invalid or missing, prompt for it
    return new NextResponse('Auth required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    })
  }

  return NextResponse.next()
}
