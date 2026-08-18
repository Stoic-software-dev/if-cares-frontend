'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, isAdmin } from '@/components/auth/AuthProvider';

// Gate for signed-in screens. Renders a quiet skeleton while the session
// resolves, and bounces to /login (or /dashboard for non-admins on admin
// pages) once it has an answer.
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
      <div className="min-h-screen bg-background">
        <div className="h-[54px] border-b border-slate-200 bg-white md:h-[58px]" />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 pt-6 md:px-8">
          <div className="h-8 w-48 rounded-lg bg-slate-200/70" />
          <div className="h-44 rounded-[14px] bg-slate-200/50" />
        </div>
      </div>
    );
  }

  return children;
}
