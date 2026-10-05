import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarClock, Eye, EyeOff, IdCard, KeyRound, Lock, Pencil, Plus, Trash2, Users as UsersIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import Alert, { ErrorState } from '../../components/common/Alert.jsx';
import Badge from '../../components/common/Badge.jsx';
import Button, { IconButton } from '../../components/common/Button.jsx';
import Card from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import { FilterSelect, ListToolbar, SearchInput } from '../../components/common/ListFilters.jsx';
import Modal, { ModalActions } from '../../components/common/Modal.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import StudentRecord from '../../components/enrollment/StudentRecord.jsx';
import AvailabilityEditor from '../../components/schedule/AvailabilityEditor.jsx';
import { PageLoader } from '../../components/common/Spinner.jsx';
import { enrollmentService } from '../../services/enrollment.service.js';
import TextField, { SelectField } from '../../components/common/TextField.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useUsers } from '../../hooks/useUsers.js';
import { classroomService } from '../../services/classroom.service.js';
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

const STATUS_TONES = { active: 'success', inactive: 'neutral', suspended: 'warning' };

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
  const [availabilityUser, setAvailabilityUser] = useState(null);
  const [recordUser, setRecordUser] = useState(null);
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

      <ListToolbar count={list.pagination?.total} noun="user">
        <SearchInput
          id="user-search"
          label="Search users"
          value={searchText}
          onChange={setSearchText}
          placeholder="Search by name or email"
          maxLength={100}
          className="sm:w-80"
        />
        <div className={`grid gap-2 sm:flex sm:items-center ${fixedRole ? '' : 'grid-cols-2'}`}>
          {!fixedRole && (
            <FilterSelect
              id="filter-role"
              label="Role"
              className="sm:w-40"
              value={filters.role}
              onChange={(value) => updateFilters({ role: value })}
              options={[{ value: '', label: 'All roles' }, ...ROLE_OPTIONS]}
            />
          )}
          <FilterSelect
            id="filter-status"
            label="Status"
            className="sm:w-40"
            value={filters.status}
            onChange={(value) => updateFilters({ status: value })}
            options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]}
          />
        </div>
      </ListToolbar>

      <UserTable
        list={list}
        currentUserId={currentUser.id}
        hasFilters={hasFilters}
        can={can}
        onEdit={(user) => setForm({ user })}
        onAvailability={setAvailabilityUser}
        onRecord={setRecordUser}
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
        open={Boolean(availabilityUser)}
        onClose={() => setAvailabilityUser(null)}
        title="Teaching Availability"
        description={availabilityUser
          && `${availabilityUser.firstName} ${availabilityUser.lastName} · Classes are scheduled inside these weekly times.`}
        size="max-w-2xl"
      >
        {availabilityUser && (
          <AvailabilityEditor
            initial={availabilityUser.availability ?? []}
            onCancel={() => setAvailabilityUser(null)}
            onSave={async (availability) => {
              await userService.update(availabilityUser.id, { availability });
              toast.success(`Availability saved for ${availabilityUser.firstName}.`);
              setAvailabilityUser(null);
              list.reload();
            }}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(recordUser)}
        onClose={() => setRecordUser(null)}
        title="Enrollment Record"
        description={recordUser && `${recordUser.firstName} ${recordUser.lastName} · ${recordUser.email}`}
        size="max-w-2xl"
      >
        {recordUser && <RecordOf key={recordUser.id} user={recordUser} />}
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
              <span className="font-medium text-ink-900">
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

function UserTable({ list, currentUserId, hasFilters, can, onEdit, onAvailability, onRecord, onResetPassword, onDelete }) {
  const { status, items, pagination, error } = list;
  const showActions = can.update || can.remove;

  if (status === 'error') return <ErrorState message={error} onRetry={list.reload} />;

  if (status === 'loading' && items.length === 0) return <PageLoader label="Loading users…" />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title={hasFilters ? 'No matching users' : 'No users yet'}
        message={hasFilters ? 'Try a different search or clear the filters.' : 'Users you add will be listed here.'}
      />
    );
  }

  return (
    <Card className={`overflow-hidden transition-opacity ${status === 'loading' ? 'opacity-60' : ''}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-ink-200 text-left text-xs font-medium uppercase tracking-wider text-ink-500">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Name</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Role</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
              <th scope="col" className="whitespace-nowrap px-5 py-2.5 font-medium">Last sign-in</th>
              {showActions && (
                <th scope="col" className="relative px-5 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {items.map((user) => {
              const isSelf = user.id === currentUserId;
              const fullName = `${user.firstName} ${user.lastName}`;
              return (
                <tr key={user.id} className="hover:bg-ink-50">
                  <td className="max-w-xs px-5 py-3">
                    <p className="truncate font-medium text-ink-900">
                      {fullName}
                      {isSelf && <span className="ml-1.5 font-normal text-ink-500">(you)</span>}
                    </p>
                    <p className="truncate text-ink-500">{user.email}</p>
                  </td>
                  <td className="px-5 py-3 text-ink-700">{ROLE_LABELS[user.role]}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONES[user.status]}>{STATUS_LABELS[user.status]}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-ink-600">
                    {user.lastLoginAt ? (
                      <time dateTime={user.lastLoginAt}>{formatDateTime(user.lastLoginAt)}</time>
                    ) : (
                      <span className="text-ink-400">Never</span>
                    )}
                  </td>
                  {showActions && (
                    <td className="whitespace-nowrap px-5 py-2 text-right">
                      <div className="inline-flex gap-0.5">
                        {can.update && (
                          <>
                            <IconButton label={`Edit ${fullName}`} icon={Pencil} onClick={() => onEdit(user)} />
                            {user.role === 'student' && (
                              <IconButton
                                label={`Enrollment record of ${fullName}`}
                                icon={IdCard}
                                onClick={() => onRecord(user)}
                              />
                            )}
                            {user.role === 'teacher' && (
                              <IconButton
                                label={`Set teaching availability for ${fullName}`}
                                icon={CalendarClock}
                                onClick={() => onAvailability(user)}
                              />
                            )}
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
        className="border-t border-ink-200 px-5 py-3"
        pagination={pagination}
        itemCount={items.length}
        disabled={status === 'loading'}
        onPageChange={list.setPage}
      />
    </Card>
  );
}

/** The details a student gave when they applied, for accounts that came from an enrollment application. */
function RecordOf({ user }) {
  const [state, setState] = useState({ status: 'loading', record: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    enrollmentService.recordOf(user.id)
      .then((record) => {
        if (!cancelled) setState({ status: 'ready', record, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', record: null, error: getErrorMessage(error, 'Unable to load the record.') });
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const applicationId = state.record?.id;
  const loadPhoto = useCallback(() => enrollmentService.photoUrl(applicationId), [applicationId]);

  if (state.status === 'loading') return <PageLoader label="Loading record…" className="py-8" />;
  if (state.status === 'error') return <Alert tone="error">{state.error}</Alert>;
  if (!state.record) {
    return <Alert>This account was created by an administrator, so it has no enrollment application on file.</Alert>;
  }
  return <StudentRecord record={state.record} loadPhoto={loadPhoto} />;
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
        <IconButton
          label={shown ? 'Hide password' : 'Show password'}
          icon={shown ? EyeOff : Eye}
          onClick={() => setShown((value) => !value)}
        />
      }
      {...registration}
    />
  );
}

function FormActions({ onCancel, isSubmitting, submitLabel }) {
  return (
    <ModalActions>
      <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" isLoading={isSubmitting}>
        {submitLabel}
      </Button>
    </ModalActions>
  );
}

/**
 * The active classrooms a teacher or student belongs to. If they cannot be
 * loaded the list is empty: the server applies the same rules either way.
 */
async function classroomsOf(user) {
  try {
    const members = (classroom) => (user.role === 'teacher'
      ? [classroom.teacher, ...(classroom.teachers ?? [])]
      : classroom.students ?? []);
    return (await classroomService.list())
      .filter((classroom) => members(classroom).some((person) => (person?.id ?? person) === user.id));
  } catch {
    return [];
  }
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

  // A role change waiting for the admin to confirm: `{ values, classrooms }`.
  const [roleChange, setRoleChange] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const save = async (values) => {
    setServerError('');
    try {
      const saved = isEdit ? await userService.update(user.id, values) : await userService.create(values);
      toast.success(`${saved.firstName} ${saved.lastName} was ${isEdit ? 'updated' : 'added'}.`);
      onSaved();
    } catch (error) {
      setServerError(getErrorMessage(error, `Unable to ${isEdit ? 'update' : 'create'} user.`));
    }
  };

  const onSubmit = async (values) => {
    // Changing a teacher's or student's role takes them out of their classrooms, so say which first.
    if (isEdit && values.role && values.role !== user.role && user.role !== 'admin') {
      const classrooms = await classroomsOf(user);
      if (classrooms.length) {
        setRoleChange({ values, classrooms });
        return;
      }
    }
    await save(values);
  };

  const confirmRoleChange = async () => {
    setIsConfirming(true);
    await save(roleChange.values);
    setIsConfirming(false);
    setRoleChange(null);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <ConfirmDialog
        open={Boolean(roleChange)}
        title={`Change ${user?.firstName}’s role?`}
        message={roleChange && (
          <>
            <p>
              <span className="font-medium text-ink-900">{user.firstName} {user.lastName}</span> will become
              a {ROLE_LABELS[roleChange.values.role].toLowerCase()} and be removed from{' '}
              {roleChange.classrooms.length === 1 ? 'this classroom' : `these ${roleChange.classrooms.length} classrooms`} and
              its upcoming sessions:
            </p>
            <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-ink-900">
              {roleChange.classrooms.map((classroom) => <li key={classroom.id}>{classroom.name}</li>)}
            </ul>
            <p className="mt-2">Past sessions and attendance are kept.</p>
          </>
        )}
        confirmLabel="Change role"
        isLoading={isConfirming}
        onConfirm={confirmRoleChange}
        onCancel={() => setRoleChange(null)}
      />
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
            <p id="user-role-label" className="mb-1.5 text-sm font-medium text-ink-700">Role</p>
            <p
              aria-labelledby="user-role-label"
              className="flex h-10.5 items-center justify-between gap-2 rounded-lg border border-ink-300 bg-ink-50 px-3 text-sm text-ink-500"
              title="Change roles from All Users"
            >
              {ROLE_LABELS[fixedRole]}
              <Lock className="size-4 text-ink-400" aria-hidden="true" />
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
      {isSelf && <p className="-mt-2 text-sm text-ink-500">You cannot change your own role or status.</p>}

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
