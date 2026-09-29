import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, Trash2, Users as UsersIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import Alert from '../../components/common/Alert.jsx';
import Button from '../../components/common/Button.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import Modal from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import Spinner from '../../components/common/Spinner.jsx';
import TextField, { SelectField } from '../../components/common/TextField.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useUsers } from '../../hooks/useUsers.js';
import { userService } from '../../services/user.service.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { hasPermission, PERMISSIONS, ROLE_LABELS, STATUS_LABELS } from '../../utils/roles.js';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

const PAGE_COPY = {
  all: { title: 'All Users', description: 'Create accounts, assign roles and control who can sign in.' },
  teacher: { title: 'Teachers', description: 'Teacher accounts and their access to the teacher portal.' },
  student: { title: 'Students', description: 'Student accounts that can sign in to check their session attendance.' },
};

const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const ROLE_OPTIONS = toOptions(ROLE_LABELS);
const STATUS_OPTIONS = toOptions(STATUS_LABELS);

const ROLE_BADGES = {
  admin: 'bg-violet-50 text-violet-700',
  teacher: 'bg-indigo-50 text-indigo-700',
  student: 'bg-sky-50 text-sky-700',
};
const STATUS_BADGES = {
  active: 'bg-emerald-50 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  suspended: 'bg-amber-50 text-amber-800',
};

// Keep in sync with server/src/validators/auth.validators.js.
const name = (label) =>
  z.string().trim().min(1, `${label} is required`).max(50, `${label} must be at most 50 characters`);
const email = z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email address'));
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const role = z.enum(Object.keys(ROLE_LABELS));
const status = z.enum(Object.keys(STATUS_LABELS));

const createUserSchema = z.object({
  firstName: name('First name'),
  lastName: name('Last name'),
  email,
  password,
  role,
  status,
});
// Role and status are left out (undefined) when admins edit their own account.
const editUserSchema = z.object({
  firstName: name('First name'),
  lastName: name('Last name'),
  email,
  role: role.optional(),
  status: status.optional(),
});
const resetPasswordSchema = z.object({ password });

export default function Users({ role: fixedRole }) {
  const { user: currentUser } = useAuth();
  const list = useUsers(PAGE_SIZE, { role: fixedRole ?? '' });
  const { filters, updateFilters } = list;
  const copy = PAGE_COPY[fixedRole ?? 'all'];

  const can = {
    create: hasPermission(currentUser, PERMISSIONS.USERS_CREATE),
    update: hasPermission(currentUser, PERMISSIONS.USERS_UPDATE),
    remove: hasPermission(currentUser, PERMISSIONS.USERS_DELETE),
  };

  const [searchText, setSearchText] = useState('');
  // `null` = closed, `{}` = create, `{ user }` = edit.
  const [form, setForm] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const search = searchText.trim();
    if (search === filters.search) return undefined;
    const timer = setTimeout(() => updateFilters({ search }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText, filters.search, updateFilters]);

  const onSaved = () => {
    setForm(null);
    list.reload();
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await userService.remove(deletingUser.id);
      toast.success(`${deletingUser.firstName} ${deletingUser.lastName} was deleted.`);
      setDeletingUser(null);
      // Step back if that was the last row on this page.
      if (list.items.length === 1 && list.page > 1) list.setPage(list.page - 1);
      else list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to delete user.'));
      setDeletingUser(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const hasFilters = Boolean(filters.search || filters.status || (!fixedRole && filters.role));

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          can.create && (
            <Button onClick={() => setForm({})}>
              <Plus className="size-4" aria-hidden="true" />
              Add User
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="user-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by name or email"
            maxLength={100}
            className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-xs outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        {!fixedRole && (
          <SelectField
            id="filter-role"
            label="Role"
            className="sm:w-44"
            value={filters.role}
            onChange={(event) => updateFilters({ role: event.target.value })}
            options={[{ value: '', label: 'All roles' }, ...ROLE_OPTIONS]}
          />
        )}
        <SelectField
          id="filter-status"
          label="Status"
          className="sm:w-44"
          value={filters.status}
          onChange={(event) => updateFilters({ status: event.target.value })}
          options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]}
        />
      </div>

      <UserTable
        list={list}
        currentUserId={currentUser.id}
        hasFilters={hasFilters}
        can={can}
        onEdit={(user) => setForm({ user })}
        onResetPassword={setPasswordUser}
        onDelete={setDeletingUser}
      />

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.user ? 'Edit User' : 'Add User'}
        description={form?.user ? form.user.email : 'The user can sign in with this email and password.'}
        size="max-w-2xl"
      >
        {form && (
          <UserForm
            user={form.user}
            fixedRole={fixedRole}
            isSelf={form.user?.id === currentUser.id}
            onCancel={() => setForm(null)}
            onSaved={onSaved}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(passwordUser)}
        onClose={() => setPasswordUser(null)}
        title="Reset Password"
        description={passwordUser && `${passwordUser.firstName} ${passwordUser.lastName} · ${passwordUser.email}`}
      >
        {passwordUser && (
          <ResetPasswordForm
            user={passwordUser}
            isSelf={passwordUser.id === currentUser.id}
            onCancel={() => setPasswordUser(null)}
            onDone={() => {
              setPasswordUser(null);
              // Resetting your own password revokes your session too; the next
              // request fails with 401 and the app returns to the login page.
              list.reload();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingUser)}
        title="Delete this user?"
        message={
          deletingUser && (
            <p>
              <span className="font-medium text-slate-900">
                {deletingUser.firstName} {deletingUser.lastName}
              </span>{' '}
              ({deletingUser.email}) will be permanently deleted. To keep their history, set their status to
              Inactive instead.
            </p>
          )
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingUser(null)}
      />
    </>
  );
}

function Badge({ className, children }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function IconButton({ label, icon: Icon, tone = 'default', ...props }) {
  const colors = tone === 'danger' ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-slate-900';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 text-slate-500 transition ${colors}`}
      {...props}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

function UserTable({ list, currentUserId, hasFilters, can, onEdit, onResetPassword, onDelete }) {
  const { status, items, pagination, error } = list;
  const showActions = can.update || can.remove;

  if (status === 'error') {
    return (
      <div className="space-y-3">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" onClick={list.reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (status === 'loading' && items.length === 0) {
    return (
      <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-16 text-indigo-600">
        <Spinner className="size-6" />
        <span className="sr-only">Loading users…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <UsersIcon className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-semibold text-slate-900">{hasFilters ? 'No matching users' : 'No users yet'}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {hasFilters ? 'Try a different search or clear the filters.' : 'Users you add will be listed here.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3">Name</th>
              <th scope="col" className="px-5 py-3">Role</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="whitespace-nowrap px-5 py-3">Last Sign-in</th>
              {showActions && (
                <th scope="col" className="px-5 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((user) => {
              const isSelf = user.id === currentUserId;
              const fullName = `${user.firstName} ${user.lastName}`;
              return (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="max-w-xs px-5 py-3.5">
                    <p className="truncate font-medium text-slate-900">
                      {fullName}
                      {isSelf && <span className="ml-1.5 font-normal text-slate-500">(you)</span>}
                    </p>
                    <p className="truncate text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge className={ROLE_BADGES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge className={STATUS_BADGES[user.status]}>{STATUS_LABELS[user.status]}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                    {user.lastLoginAt ? (
                      <time dateTime={user.lastLoginAt}>{formatDateTime(user.lastLoginAt)}</time>
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </td>
                  {showActions && (
                    <td className="whitespace-nowrap px-5 py-3.5 text-right">
                      <div className="inline-flex gap-1">
                        {can.update && (
                          <>
                            <IconButton label={`Edit ${fullName}`} icon={Pencil} onClick={() => onEdit(user)} />
                            <IconButton
                              label={`Reset password for ${fullName}`}
                              icon={KeyRound}
                              onClick={() => onResetPassword(user)}
                            />
                          </>
                        )}
                        {can.remove && !isSelf && (
                          <IconButton
                            label={`Delete ${fullName}`}
                            icon={Trash2}
                            tone="danger"
                            onClick={() => onDelete(user)}
                          />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        className="border-t border-slate-200 px-5 py-3"
        pagination={pagination}
        itemCount={items.length}
        disabled={status === 'loading'}
        onPageChange={list.setPage}
      />
    </div>
  );
}

function PasswordField({ id, label, error, registration }) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      id={id}
      label={label}
      type={shown ? 'text' : 'password'}
      autoComplete="new-password"
      error={error}
      trailing={
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          className="rounded-md p-1.5 text-slate-400 hover:text-slate-600"
          aria-label={shown ? 'Hide password' : 'Show password'}
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
      {...registration}
    />
  );
}

function FormActions({ onCancel, isSubmitting, submitLabel }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" isLoading={isSubmitting}>
        {submitLabel}
      </Button>
    </div>
  );
}

function UserForm({ user, fixedRole, isSelf, onCancel, onSaved }) {
  const isEdit = Boolean(user);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(isEdit ? editUserSchema : createUserSchema),
    defaultValues: isEdit
      ? {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          status: user.status,
        }
      : { firstName: '', lastName: '', email: '', password: '', role: fixedRole ?? 'teacher', status: 'active' },
  });

  const onSubmit = async (values) => {
    setServerError('');
    try {
      const saved = isEdit ? await userService.update(user.id, values) : await userService.create(values);
      toast.success(`${saved.firstName} ${saved.lastName} was ${isEdit ? 'updated' : 'added'}.`);
      onSaved();
    } catch (error) {
      setServerError(getErrorMessage(error, `Unable to ${isEdit ? 'update' : 'create'} user.`));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && <Alert tone="error">{serverError}</Alert>}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="user-first-name"
          label="First name"
          maxLength={50}
          autoComplete="off"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          id="user-last-name"
          label="Last name"
          maxLength={50}
          autoComplete="off"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>

      <TextField
        id="user-email"
        label="Email"
        type="email"
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />

      {!isEdit && (
        <PasswordField
          id="user-password"
          label="Password"
          error={errors.password?.message}
          registration={register('password')}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {fixedRole ? (
          // The Teachers and Students tabs only manage their own role; change roles from All Users.
          <div>
            <p id="user-role-label" className="mb-1.5 text-sm font-medium text-slate-700">Role</p>
            <p
              aria-labelledby="user-role-label"
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"
              title="Change roles from All Users"
            >
              {ROLE_LABELS[fixedRole]}
              <Lock className="size-4 text-slate-400" aria-hidden="true" />
            </p>
            <input type="hidden" {...register('role')} />
          </div>
        ) : (
          <SelectField
            id="user-role"
            label="Role"
            options={ROLE_OPTIONS}
            error={errors.role?.message}
            {...register('role', { disabled: isSelf })}
          />
        )}
        <SelectField
          id="user-status"
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          {...register('status', { disabled: isSelf })}
        />
      </div>
      {isSelf && <p className="-mt-2 text-sm text-slate-500">You cannot change your own role or status.</p>}

      <FormActions onCancel={onCancel} isSubmitting={isSubmitting} submitLabel={isEdit ? 'Save changes' : 'Add user'} />
    </form>
  );
}

function ResetPasswordForm({ user, isSelf, onCancel, onDone }) {
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '' } });

  const onSubmit = async ({ password: newPassword }) => {
    setServerError('');
    try {
      await userService.resetPassword(user.id, newPassword);
      toast.success(
        isSelf ? 'Password changed. Sign in with your new password.' : `Password reset for ${user.firstName}.`,
      );
      onDone();
    } catch (error) {
      setServerError(getErrorMessage(error, 'Unable to reset password.'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && <Alert tone="error">{serverError}</Alert>}
      <Alert>
        {isSelf
          ? 'You will be signed out and need to sign in again with the new password.'
          : 'The user will be signed out of all devices and must use the new password.'}
      </Alert>
      <PasswordField
        id="reset-password"
        label="New password"
        error={errors.password?.message}
        registration={register('password')}
      />
      <FormActions onCancel={onCancel} isSubmitting={isSubmitting} submitLabel="Reset password" />
    </form>
  );
}
