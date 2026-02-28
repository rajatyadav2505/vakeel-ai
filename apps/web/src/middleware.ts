import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/',
  '/cases(.*)',
  '/simulations(.*)',
  '/petitions(.*)',
  '/settings(.*)',
  '/whatsapp(.*)',
  '/api/simulations(.*)',
  '/api/petitions(.*)',
  '/api/cases(.*)',
  '/api/settings(.*)',
  '/api/whatsapp/send',
  '/api/whatsapp/messages(.*)',
]);
const isWorkerRoute = createRouteMatcher(['/api/simulations/worker']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req) && !isWorkerRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/api/(.*)'],
};
