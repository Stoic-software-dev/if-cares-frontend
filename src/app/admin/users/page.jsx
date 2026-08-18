'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import { useAuth } from '@/components/auth/AuthProvider';
import AppNavbar from '@/components/shell/AppNavbar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 15;

function shortSite(name) {
  return name.replace(/^\d{4}\/\d{4}\s+(TX|OK)?\s*/i, '');
}

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

const EMPTY_FORM = { name: '', lastname: '', email: '', role: 'USER', allSites: false, sites: [] };

function UserDialog({ open, mode, initial, siteOptions, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [siteQuery, setSiteQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ?? EMPTY_FORM);
      setSiteQuery('');
    }
  }, [open, initial]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const toggleSite = (name) =>
    set({
      sites: form.sites.includes(name) ? form.sites.filter((s) => s !== name) : [...form.sites, name],
    });

  const visibleSiteOptions = siteOptions.filter((name) =>
    name.toLowerCase().includes(siteQuery.trim().toLowerCase())
  );

  const valid =
    form.name.trim() &&
    form.lastname.trim() &&
    /.+@.+\..+/.test(form.email.trim()) &&
    (form.allSites || form.role === 'ADMIN' || form.sites.length > 0);

  const save = async () => {
    if (!valid) {
      toast.error('Complete name, email and at least one site.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        lastname: form.lastname.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        allSites: form.role === 'ADMIN' ? true : form.allSites,
        sites: form.sites,
      };
      if (mode === 'create') {
        const res = await apiPost('/api/users', payload);
        onSaved(res.data.user, res.data.resetLink);
      } else {
        const res = await apiPatch(`/api/users/${initial.id}`, payload);
        onSaved(res.data, null);
      }
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add user' : 'Edit user'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'The account is created without a password; you get a link to hand them.'
              : 'Changes apply immediately.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px] text-slate-700">First name</Label>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} className="h-11 rounded-[9px] border-slate-300" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px] text-slate-700">Last name</Label>
              <Input value={form.lastname} onChange={(e) => set({ lastname: e.target.value })} className="h-11 rounded-[9px] border-slate-300" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] text-slate-700">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className="h-11 rounded-[9px] border-slate-300" />
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px] text-slate-700">Role</Label>
              <div className="relative">
                <select
                  value={form.role}
                  onChange={(e) => set({ role: e.target.value })}
                  className="h-11 w-full appearance-none rounded-[9px] border border-slate-300 bg-white px-3 pr-9 text-sm font-medium text-slate-900 outline-none transition-shadow focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                >
                  <option value="USER">Staff</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
            {form.role !== 'ADMIN' && (
              <label className="flex h-11 items-center justify-between rounded-[9px] border border-slate-300 px-3">
                <span className="text-[13px] font-medium text-slate-700">All sites</span>
                <Switch checked={form.allSites} onCheckedChange={(value) => set({ allSites: value })} />
              </label>
            )}
          </div>

          {form.role !== 'ADMIN' && !form.allSites && (
            <div className="flex flex-col gap-2">
              <Label className="text-[13px] text-slate-700">
                Sites · {form.sites.length} selected
              </Label>
              <div className="flex h-9 items-center gap-2 rounded-[9px] border border-slate-300 px-3">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  value={siteQuery}
                  onChange={(e) => setSiteQuery(e.target.value)}
                  placeholder="Filter sites"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="max-h-44 overflow-y-auto rounded-[9px] border border-slate-200">
                {visibleSiteOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleSite(name)}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-[13px] text-slate-700 transition-colors last:border-b-0 hover:bg-slate-50"
                  >
                    <span className="truncate pr-2">{name}</span>
                    {form.sites.includes(name) && <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />}
                  </button>
                ))}
                {visibleSiteOptions.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">No sites match.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="h-10 rounded-[9px] border-slate-300 font-semibold text-slate-700">
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="h-10 rounded-[9px] px-5 font-semibold">
            {saving ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetLinkDialog({ data, onClose }) {
  const copy = async () => {
    await navigator.clipboard.writeText(data.link);
    toast.success('Link copied');
  };

  return (
    <Dialog open={Boolean(data)} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Password link for {data?.email}</DialogTitle>
          <DialogDescription>
            Send this link to the user — it lets them set their password and expires in 24 hours.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={data?.link ?? ''} className="h-11 rounded-[9px] border-slate-300 text-xs" />
          <Button onClick={copy} className="h-11 shrink-0 rounded-[9px] px-4 font-semibold">
            <Copy className="h-4 w-4" />
            Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdminUsersScreen() {
  const { user: sessionUser } = useAuth();
  const [users, setUsers] = useState(null);
  const [siteOptions, setSiteOptions] = useState([]);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [page, setPage] = useState(0);

  const [dialog, setDialog] = useState(null); // { mode, initial }
  const [resetLink, setResetLink] = useState(null); // { email, link }

  const load = () => {
    setError('');
    Promise.all([apiGet('/api/users'), apiGet('/api/sites')])
      .then(([usersRes, sites]) => {
        setUsers(usersRes.data);
        setSiteOptions(sites.map((s) => s.name));
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (activeOnly && !user.active) return false;
      if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;
      if (siteFilter !== 'ALL' && !user.allSites && !user.sites.includes(siteFilter)) return false;
      if (!q) return true;
      return (
        `${user.name} ${user.lastname}`.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)
      );
    });
  }, [users, query, activeOnly, roleFilter, siteFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const adminCount = (users ?? []).filter((u) => u.role === 'ADMIN').length;

  const upsertRow = (row) =>
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === row.id);
      const next = exists ? prev.map((u) => (u.id === row.id ? row : u)) : [...prev, row];
      return next.sort((a, b) => `${a.name} ${a.lastname}`.localeCompare(`${b.name} ${b.lastname}`));
    });

  const sendResetLink = async (user) => {
    try {
      const res = await apiPost(`/api/users/${user.id}/reset-link`, {});
      setResetLink({ email: user.email, link: res.data.resetLink });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleActive = async (user) => {
    try {
      const res = await apiPatch(`/api/users/${user.id}`, { active: !user.active });
      upsertRow(res.data);
      toast.success(user.active ? `${user.name} deactivated` : `${user.name} reactivated`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const sitesLabel = (user) =>
    user.allSites || user.role === 'ADMIN'
      ? 'All sites'
      : user.sites.map(shortSite).join(' · ') || '—';

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar active="Users" />

      <main className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-5 md:px-8 md:py-7">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Users</h1>
            <p className="text-[13px] tabular-nums text-slate-500">
              {users ? `${users.length} accounts · ${adminCount} administrators` : 'Loading…'}
            </p>
          </div>
          <Button
            onClick={() => setDialog({ mode: 'create', initial: null })}
            className="h-10 rounded-[9px] px-4 text-[13px] font-semibold"
          >
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.2} />
            Add user
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-10 w-80 items-center gap-2 rounded-[9px] border border-slate-300 bg-white px-3 transition-shadow focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15">
            <Search className="h-[15px] w-[15px] text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search by name or email"
              className="flex-1 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-10 items-center gap-2 rounded-[9px] border px-3 text-[13px]',
                  roleFilter === 'ALL'
                    ? 'border-slate-300 bg-white font-medium text-slate-700 transition-colors hover:border-slate-400'
                    : 'border-teal-200 bg-teal-50 font-semibold text-primary'
                )}
              >
                {roleFilter === 'ALL' ? 'Role' : `Role: ${roleFilter === 'ADMIN' ? 'Admin' : 'Staff'}`}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {[
                { key: 'ALL', label: 'All roles' },
                { key: 'ADMIN', label: 'Admin' },
                { key: 'USER', label: 'Staff' },
              ].map((option) => (
                <DropdownMenuItem
                  key={option.key}
                  onClick={() => {
                    setRoleFilter(option.key);
                    setPage(0);
                  }}
                  className={cn('text-[13px]', roleFilter === option.key && 'font-semibold text-primary')}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-10 items-center gap-2 rounded-[9px] border px-3 text-[13px]',
                  siteFilter === 'ALL'
                    ? 'border-slate-300 bg-white font-medium text-slate-700 transition-colors hover:border-slate-400'
                    : 'border-teal-200 bg-teal-50 font-semibold text-primary'
                )}
              >
                {siteFilter === 'ALL' ? 'Site' : `Site: ${shortSite(siteFilter)}`}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
              <DropdownMenuItem
                onClick={() => {
                  setSiteFilter('ALL');
                  setPage(0);
                }}
                className={cn('text-[13px]', siteFilter === 'ALL' && 'font-semibold text-primary')}
              >
                All sites
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {siteOptions.map((name) => (
                <DropdownMenuItem
                  key={name}
                  onClick={() => {
                    setSiteFilter(name);
                    setPage(0);
                  }}
                  className={cn('text-[13px]', siteFilter === name && 'font-semibold text-primary')}
                >
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {activeOnly ? (
            <button
              type="button"
              onClick={() => setActiveOnly(false)}
              className="flex h-10 items-center gap-2 rounded-[9px] border border-teal-200 bg-teal-50 px-3 text-[13px] font-semibold text-primary"
            >
              Status: Active
              <X className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveOnly(true)}
              className="flex h-10 items-center gap-2 rounded-[9px] border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-400"
            >
              Status: All
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {error && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-12">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <span className="text-[13px] font-semibold text-red-700">{error}</span>
            <Button variant="outline" onClick={load} className="mt-1 h-9 rounded-lg border-slate-300 px-4 text-xs font-semibold text-slate-700">
              Try again
            </Button>
          </div>
        )}

        {!users && !error && <div className="h-96 rounded-xl bg-slate-200/40" />}

        {users && (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <div className="min-w-[900px] tabular-nums">
                <div className="grid grid-cols-[210px_250px_100px_minmax(0,1fr)_110px_56px] border-b border-slate-200 px-5 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Name</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Email</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Role</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Sites</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Status</span>
                  <span />
                </div>
                {pageRows.map((user, index) => (
                  <div
                    key={user.id}
                    className={cn(
                      'grid grid-cols-[210px_250px_100px_minmax(0,1fr)_110px_56px] items-center px-5 py-3 transition-colors hover:bg-slate-50/70',
                      index < pageRows.length - 1 && 'border-b border-slate-100'
                    )}
                  >
                    <span className={cn('truncate pr-3 text-[13px] font-semibold', user.active ? 'text-slate-900' : 'text-slate-400')}>
                      {user.name} {user.lastname}
                      {user.needsPassword && user.active && (
                        <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase text-amber-600">no pw</span>
                      )}
                    </span>
                    <span className={cn('truncate pr-3 text-[13px]', user.active ? 'text-slate-500' : 'text-slate-400')}>
                      {user.email}
                    </span>
                    <RoleBadge role={user.role} />
                    <span className={cn('truncate pr-4 text-[13px]', user.active ? 'text-slate-500' : 'text-slate-400')} title={sitesLabel(user)}>
                      {sitesLabel(user)}
                    </span>
                    <StatusDot active={user.active} />
                    <span className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Row actions"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          >
                            <MoreVertical className="h-[15px] w-[15px]" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            onClick={() =>
                              setDialog({
                                mode: 'edit',
                                initial: {
                                  id: user.id,
                                  name: user.name,
                                  lastname: user.lastname,
                                  email: user.email,
                                  role: user.role,
                                  allSites: user.allSites,
                                  sites: user.sites,
                                },
                              })
                            }
                            className="gap-2 text-[13px]"
                          >
                            <Pencil className="h-4 w-4 text-slate-500" />
                            Edit user
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => sendResetLink(user)} className="gap-2 text-[13px]">
                            <KeyRound className="h-4 w-4 text-slate-500" />
                            Password link
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.id !== sessionUser?.id &&
                            (user.active ? (
                              <DropdownMenuItem onClick={() => toggleActive(user)} className="gap-2 text-[13px] text-red-700">
                                <UserX className="h-4 w-4" />
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => toggleActive(user)} className="gap-2 text-[13px]">
                                <UserCheck className="h-4 w-4 text-emerald-600" />
                                Reactivate
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  </div>
                ))}
                {pageRows.length === 0 && (
                  <div className="flex flex-col items-center gap-1 px-5 py-12">
                    <span className="text-[13px] font-semibold text-slate-700">No users match your search</span>
                    <span className="text-xs text-slate-400">Try a different name or clear the filters.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-0.5">
              <span className="text-xs tabular-nums text-slate-400">
                {filtered.length === 0
                  ? '0 users'
                  : `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                  className={cn(
                    'h-[34px] rounded-lg border px-3 text-xs font-semibold',
                    currentPage === 0
                      ? 'border-slate-200 bg-white text-slate-300'
                      : 'border-slate-300 bg-white text-slate-700 transition-colors hover:border-slate-400'
                  )}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                  className={cn(
                    'h-[34px] rounded-lg border px-3 text-xs font-semibold',
                    currentPage >= pageCount - 1
                      ? 'border-slate-200 bg-white text-slate-300'
                      : 'border-slate-300 bg-white text-slate-700 transition-colors hover:border-slate-400'
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      <UserDialog
        open={Boolean(dialog)}
        mode={dialog?.mode}
        initial={dialog?.initial}
        siteOptions={siteOptions}
        onClose={() => setDialog(null)}
        onSaved={(row, link) => {
          upsertRow(row);
          toast.success(dialog?.mode === 'create' ? `${row.name} ${row.lastname} created` : 'User updated');
          if (link) setResetLink({ email: row.email, link });
        }}
      />
      <ResetLinkDialog data={resetLink} onClose={() => setResetLink(null)} />
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Protected adminOnly>
      <AdminUsersScreen />
    </Protected>
  );
}
