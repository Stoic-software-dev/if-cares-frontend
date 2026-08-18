'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, MoreVertical, Plus, Search, X } from 'lucide-react';
import AppNavbar from '@/components/shell/AppNavbar';
import { ADMIN_NAV } from '@/components/shell/nav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MOCK_ADMIN_USERS } from '@/lib/mock-data';

const ADMIN_USER = { name: 'Dana', lastname: 'Whitfield' };

function RoleBadge({ role }) {
  const admin = role === 'ADMIN';
  return (
    <span
      className={cn(
        'inline-flex w-fit justify-self-start rounded-md border px-2 py-0.5 text-[11px] font-semibold',
        admin ? 'border-teal-200 bg-teal-50 text-primary' : 'border-slate-200 bg-slate-50 text-slate-600'
      )}
    >
      {admin ? 'Admin' : 'Staff'}
    </span>
  );
}

function StatusDot({ active }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        active ? 'text-emerald-700' : 'text-slate-400'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-300')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function AdminUsersPage() {
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_ADMIN_USERS.filter((user) => {
      if (activeOnly && !user.active) return false;
      if (!q) return true;
      return user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
    });
  }, [query, activeOnly]);

  const adminCount = MOCK_ADMIN_USERS.filter((u) => u.role === 'ADMIN').length;

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar items={ADMIN_NAV} active="Users" user={ADMIN_USER} />

      <main className="mx-auto flex max-w-screen-xl flex-col gap-4 px-8 py-7">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Users</h1>
            <p className="text-[13px] tabular-nums text-slate-500">
              {MOCK_ADMIN_USERS.length} accounts · {adminCount} administrators
            </p>
          </div>
          <Button className="h-10 rounded-[9px] px-4 text-[13px] font-semibold">
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.2} />
            Add user
          </Button>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex h-10 w-80 items-center gap-2 rounded-[9px] border border-slate-300 bg-white px-3">
            <Search className="h-[15px] w-[15px] text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              className="flex-1 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
          <button type="button" className="flex h-10 items-center gap-2 rounded-[9px] border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700">
            Role
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          </button>
          <button type="button" className="flex h-10 items-center gap-2 rounded-[9px] border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700">
            Site
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          </button>
          {activeOnly && (
            <button
              type="button"
              onClick={() => setActiveOnly(false)}
              className="flex h-10 items-center gap-2 rounded-[9px] border border-teal-200 bg-teal-50 px-3 text-[13px] font-semibold text-primary"
            >
              Status: Active
              <X className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white tabular-nums">
          <div className="grid grid-cols-[230px_260px_110px_minmax(0,1fr)_110px_56px] border-b border-slate-200 px-5 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Name</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Email</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Role</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Sites</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Status</span>
            <span />
          </div>
          {users.map((user, index) => (
            <div
              key={user.id}
              className={cn(
                'grid grid-cols-[230px_260px_110px_minmax(0,1fr)_110px_56px] items-center px-5 py-3',
                index < users.length - 1 && 'border-b border-slate-100',
                !user.active && 'text-slate-400'
              )}
            >
              <span className={cn('text-[13px] font-semibold', user.active ? 'text-slate-900' : 'text-slate-400')}>
                {user.name}
              </span>
              <span className={cn('text-[13px]', user.active ? 'text-slate-500' : 'text-slate-400')}>{user.email}</span>
              <RoleBadge role={user.role} />
              <span className={cn('truncate pr-4 text-[13px]', user.active ? 'text-slate-500' : 'text-slate-400')}>
                {user.sites}
              </span>
              <StatusDot active={user.active} />
              <span className="flex justify-end">
                <button type="button" aria-label="Row actions" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500">
                  <MoreVertical className="h-[15px] w-[15px]" />
                </button>
              </span>
            </div>
          ))}
          {users.length === 0 && (
            <div className="flex flex-col items-center gap-1 px-5 py-12">
              <span className="text-[13px] font-semibold text-slate-700">No users match your search</span>
              <span className="text-xs text-slate-400">Try a different name or clear the filters.</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs tabular-nums text-slate-400">
            {users.length} of {MOCK_ADMIN_USERS.length}
          </span>
          <div className="flex gap-1.5">
            <button type="button" className="h-[34px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-400">
              Previous
            </button>
            <button type="button" className="h-[34px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">
              Next
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
