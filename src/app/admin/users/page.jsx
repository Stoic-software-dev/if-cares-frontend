'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  MoreVertical,
  Pencil,
  Plus,
  UserCheck,
  UserX,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import { useAuth } from '@/components/auth/AuthProvider';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Avatar } from '@/components/shell/UserMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { Field, NativeSelect } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { SITES_PATH, cachedGet } from '@/lib/data-cache';
import { shortSiteName, sortSiteNames } from '@/lib/sites';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 15;
const EMPTY_FORM = { name: '', lastname: '', email: '', role: 'USER', allSites: false, sites: [] };

function UserDialog({ open, mode, initial, siteOptions, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [siteQuery, setSiteQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial ?? EMPTY_FORM);
    setSiteQuery('');
    setAttempted(false);
  }, [open, initial]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const toggleSite = (name) =>
    set({
      sites: form.sites.includes(name) ? form.sites.filter((site) => site !== name) : [...form.sites, name],
    });

  const visibleSites = siteOptions.filter((name) =>
    name.toLowerCase().includes(siteQuery.trim().toLowerCase())
  );

  const emailValid = /.+@.+\..+/.test(form.email.trim());
  // A staff account with no site assigned is valid and common - 47 of the real
  // accounts are exactly that, and the API has never objected. Requiring one
  // here meant an admin fixing a typo on any of them had to invent a site
  // assignment just to be allowed to save.
  const valid = form.name.trim() && form.lastname.trim() && emailValid;

  const save = async () => {
    if (!valid) {
      setAttempted(true);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add user' : 'Edit user'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'The account is created without a password. You get a link to hand over.'
              : 'Changes apply immediately.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="First name"
              htmlFor="user-name"
              error={attempted && !form.name.trim() ? 'Required.' : undefined}
            >
              <Input
                id="user-name"
                value={form.name}
                onChange={(event) => set({ name: event.target.value })}
                aria-invalid={attempted && !form.name.trim()}
              />
            </Field>
            <Field
              label="Last name"
              htmlFor="user-lastname"
              error={attempted && !form.lastname.trim() ? 'Required.' : undefined}
            >
              <Input
                id="user-lastname"
                value={form.lastname}
                onChange={(event) => set({ lastname: event.target.value })}
                aria-invalid={attempted && !form.lastname.trim()}
              />
            </Field>
          </div>

          <Field
            label="Email"
            htmlFor="user-email"
            hint="This is the address they sign in with."
            error={attempted && !emailValid ? 'Enter a valid email address.' : undefined}
          >
            <Input
              id="user-email"
              type="email"
              autoCapitalize="none"
              spellCheck={false}
              value={form.email}
              onChange={(event) => set({ email: event.target.value })}
              aria-invalid={attempted && !emailValid}
            />
          </Field>

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <Field label="Role" htmlFor="user-role">
              <NativeSelect
                id="user-role"
                value={form.role}
                onChange={(event) => set({ role: event.target.value })}
              >
                <option value="USER">Site staff</option>
                <option value="ADMIN">Administrator</option>
              </NativeSelect>
            </Field>

            {form.role !== 'ADMIN' && (
              <label className="flex h-11 items-center justify-between rounded-md border border-input px-3 md:h-10">
                <span className="text-[13px] font-medium text-foreground">All sites</span>
                <Switch checked={form.allSites} onCheckedChange={(value) => set({ allSites: value })} />
              </label>
            )}
          </div>

          {form.role === 'ADMIN' && (
            <p className="rounded-md bg-primary-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-primary-strong dark:text-primary">
              Administrators see every site, the admin sections and the reports.
            </p>
          )}

          {form.role !== 'ADMIN' && !form.allSites && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium text-foreground">Sites</span>
                <span className="text-[12px] text-muted-foreground">
                  {form.sites.length === 0 ? 'No site yet' : `${form.sites.length} selected`}
                </span>
              </div>

              {form.sites.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.sites.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleSite(name)}
                      className="inline-flex items-center gap-1 rounded-full border border-primary-border bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary-strong transition-colors hover:brightness-95 dark:text-primary"
                    >
                      {shortSiteName(name)}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}

              <SearchInput value={siteQuery} onChange={setSiteQuery} placeholder="Filter sites" className="h-10" />

              <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                {visibleSites.map((name) => {
                  const selected = form.sites.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleSite(name)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-left text-[13px] transition-colors last:border-b-0',
                        selected ? 'bg-primary-soft/60 font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent'
                      )}
                    >
                      <span className="truncate">{shortSiteName(name)}</span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />}
                    </button>
                  );
                })}
                {visibleSites.length === 0 && (
                  <p className="px-3 py-5 text-center text-[12.5px] text-muted-foreground">No site matches.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {mode === 'create' ? 'Create user' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetLinkDialog({ data, onClose }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.link);
      toast.success('Link copied');
    } catch {
      toast.error('Copy the link manually: the browser blocked the clipboard.');
    }
  };

  return (
    <Dialog open={Boolean(data)} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Password link for {data?.email}</DialogTitle>
          <DialogDescription>
            Send this link to the user. It lets them set their own password and expires in 24 hours.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={data?.link ?? ''} className="font-mono text-[12px]" />
          <Button onClick={copy} className="shrink-0">
            <Copy />
            Copy link
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
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [page, setPage] = useState(0);

  const [dialog, setDialog] = useState(null);
  const [resetLink, setResetLink] = useState(null);
  const [deactivating, setDeactivating] = useState(null);

  const load = () => {
    setError('');
    Promise.all([apiGet('/api/users'), cachedGet(SITES_PATH)])
      .then(([usersRes, sites]) => {
        setUsers(usersRes.data);
        setSiteOptions(sortSiteNames(sites.map((site) => site.name)));
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter === 'ACTIVE' && !user.active) return false;
      if (statusFilter === 'INACTIVE' && user.active) return false;
      if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;
      if (siteFilter !== 'ALL' && !user.allSites && !user.sites.includes(siteFilter)) return false;
      if (!q) return true;
      return (
        `${user.name} ${user.lastname}`.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)
      );
    });
  }, [users, query, statusFilter, roleFilter, siteFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const counts = useMemo(() => {
    const list = users ?? [];
    return {
      all: list.length,
      active: list.filter((user) => user.active).length,
      admins: list.filter((user) => user.role === 'ADMIN').length,
    };
  }, [users]);

  const upsertRow = (row) =>
    setUsers((prev) => {
      const exists = prev.some((user) => user.id === row.id);
      const next = exists ? prev.map((user) => (user.id === row.id ? row : user)) : [...prev, row];
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

  const setActive = async (user, active) => {
    const res = await apiPatch(`/api/users/${user.id}`, { active });
    upsertRow(res.data);
  };

  const sitesLabel = (user) =>
    user.allSites || user.role === 'ADMIN'
      ? 'All sites'
      : user.sites.map(shortSiteName).join(', ') || 'No site assigned';

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Users"
          subtitle={
            users
              ? `${counts.all} accounts, ${counts.active} active, ${counts.admins} administrators`
              : 'Loading accounts'
          }
          actions={
            <Button onClick={() => setDialog({ mode: 'create', initial: null })}>
              <Plus strokeWidth={2.4} />
              Add user
            </Button>
          }
        />

        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(0);
            }}
            placeholder="Search by name or email"
            className="lg:w-80"
          />

          <Segmented
            ariaLabel="Filter by status"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(0);
            }}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'ALL', label: 'All' },
            ]}
            className="lg:w-auto"
          />

          <NativeSelect
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(0);
            }}
            className="lg:w-44"
          >
            <option value="ALL">Every role</option>
            <option value="ADMIN">Administrators</option>
            <option value="USER">Site staff</option>
          </NativeSelect>

          <NativeSelect
            aria-label="Filter by site"
            value={siteFilter}
            onChange={(event) => {
              setSiteFilter(event.target.value);
              setPage(0);
            }}
            className="lg:ml-auto lg:w-64"
          >
            <option value="ALL">All sites</option>
            {siteOptions.map((name) => (
              <option key={name} value={name}>
                {shortSiteName(name)}
              </option>
            ))}
          </NativeSelect>
        </div>

        {error && <ErrorState title="Couldn't load the users" message={error} onRetry={load} />}

        {!users && !error && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        )}

        {users && (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_110px_110px_56px] gap-4 border-b border-border bg-surface-sunken px-4 py-2 lg:grid">
                {['User', 'Sites', 'Role', 'Status', ''].map((heading, i) => (
                  <span
                    key={heading || i}
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  >
                    {heading}
                  </span>
                ))}
              </div>

              <div className="divide-y divide-border">
                {rows.map((user) => (
                  <div
                    key={user.id}
                    className={cn(
                      'flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-accent/30',
                      'lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_110px_110px_56px] lg:items-center lg:gap-4',
                      !user.active && 'opacity-70'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar user={user} className={cn(!user.active && 'bg-muted text-muted-foreground')} />
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-foreground">
                          {user.name} {user.lastname}
                          {user.needsPassword && user.active && (
                            <Badge variant="warning" size="sm">
                              No password
                            </Badge>
                          )}
                        </span>
                        <span className="truncate text-[12px] text-muted-foreground">{user.email}</span>
                      </div>
                    </div>

                    <span className="truncate text-[12.5px] text-muted-foreground" title={sitesLabel(user)}>
                      {sitesLabel(user)}
                    </span>

                    <Badge variant={user.role === 'ADMIN' ? 'brand' : 'neutral'}>
                      {user.role === 'ADMIN' ? 'Admin' : 'Staff'}
                    </Badge>

                    <Badge variant={user.active ? 'success' : 'neutral'}>
                      {user.active ? 'Active' : 'Inactive'}
                    </Badge>

                    <div className="flex lg:justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`}>
                            <MoreVertical />
                          </Button>
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
                          >
                            <Pencil />
                            Edit user
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => sendResetLink(user)}>
                            <KeyRound />
                            Password link
                          </DropdownMenuItem>
                          {user.id !== sessionUser?.id && (
                            <>
                              <DropdownMenuSeparator />
                              {user.active ? (
                                <DropdownMenuItem destructive onClick={() => setDeactivating(user)}>
                                  <UserX />
                                  Deactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={async () => {
                                    try {
                                      await setActive(user, true);
                                      toast.success(`${user.name} reactivated`);
                                    } catch (err) {
                                      toast.error(err.message);
                                    }
                                  }}
                                >
                                  <UserCheck />
                                  Reactivate
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {rows.length === 0 && (
                <EmptyState
                  icon={UsersIcon}
                  title="No user matches"
                  description="Try a different name, or clear the filters."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuery('');
                        setRoleFilter('ALL');
                        setSiteFilter('ALL');
                        setStatusFilter('ALL');
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              )}
            </div>

            <Pagination
              page={currentPage + 1}
              pageCount={pageCount}
              onPageChange={(next) => setPage(next - 1)}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              label="accounts"
            />

          </>
        )}
      </div>

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

      <ConfirmDialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Deactivate ${deactivating?.name ?? ''} ${deactivating?.lastname ?? ''}?`}
        description="They will not be able to sign in until an administrator reactivates the account."
        consequences={[
          'Their submitted counts and requests stay exactly as they are.',
          'Any open session ends the next time the app checks the session.',
          'The account can be reactivated at any time.',
        ]}
        confirmLabel="Deactivate"
        onConfirm={async () => {
          await setActive(deactivating, false);
          toast.success(`${deactivating.name} deactivated`);
          setDeactivating(null);
        }}
      />
    </AppShell>
  );
}

export default function AdminUsersPage() {
  return (
    <Protected adminOnly>
      <AdminUsersScreen />
    </Protected>
  );
}
