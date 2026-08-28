'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, isAdmin } from '@/components/auth/AuthProvider';
import { Skeleton } from '@/components/ui/skeleton';

// Gate for signed-in screens. While the session resolves it renders the shape
// of the app (bar, header, content block) so the first paint does not jump
// once the real screen arrives.
export default function Protected({ adminOnly = false, children }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (adminOnly && !isAdmin(user)) router.replace('/dashboard');
  }, [loading, user, adminOnly, router]);

  if (loading || !user || (adminOnly && !isAdmin(user))) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="h-14 border-b border-border bg-card md:h-[60px]" />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 pt-6 md:px-8">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-11 w-full max-w-sm" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return children;
}
