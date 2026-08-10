import { useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ApprovalRequest, type Recipe } from '../lib/db';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { syncRecipes, syncAllApprovalRequests } from '../lib/sync';
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Globe, Edit3, Trash2, ChefHat, Users, UserPlus, UserMinus } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Toast';

type RequestWithRecipe = ApprovalRequest & { recipe: Recipe | undefined };

interface AdminRow {
  email: string;
  added_by: string | null;
  created_at: string;
}

interface DialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

const REQUEST_META: Record<ApprovalRequest['request_type'], { label: string; icon: typeof Globe; color: string }> = {
  promote_to_global: { label: 'Promote to Global', icon: Globe, color: 'text-blue-600 bg-blue-50' },
  edit_global: { label: 'Edit Global Recipe', icon: Edit3, color: 'text-amber-600 bg-amber-50' },
  delete_global: { label: 'Delete Global Recipe', icon: Trash2, color: 'text-red-600 bg-red-50' },
};

export function Admin() {
  const { user, isAdmin, isAdminChecked } = useAuth();

  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const loadAdmins = useCallback(async () => {
    const { data, error } = await supabase.from('admins').select('*').order('created_at', { ascending: true });
    if (!error && data) setAdmins(data);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    syncRecipes();
    syncAllApprovalRequests();
    loadAdmins();
  }, [isAdmin, loadAdmins]);

  const pendingRequests = useLiveQuery<RequestWithRecipe[]>(async () => {
    if (!isAdmin) return [];
    const requests = await db.approval_requests.where('status').equals('pending').toArray();
    const withRecipes = await Promise.all(
      requests.map(async (req) => ({ ...req, recipe: await db.recipes.get(req.recipe_id) }))
    );
    return withRecipes.sort(
      (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    );
  }, [isAdmin]);

  const resolveRequest = async (req: RequestWithRecipe, decision: 'approved' | 'rejected') => {
    const now = new Date().toISOString();

    if (decision === 'approved') {
      if (req.request_type === 'promote_to_global') {
        await db.recipes.update(req.recipe_id, { visibility: 'global' });
        await supabase.from('recipes').update({ visibility: 'global' }).eq('id', req.recipe_id);
      } else if (req.request_type === 'edit_global' && req.proposed_changes) {
        await db.recipes.update(req.recipe_id, req.proposed_changes);
        await supabase.from('recipes').update(req.proposed_changes).eq('id', req.recipe_id);
      } else if (req.request_type === 'delete_global') {
        await db.recipes.update(req.recipe_id, { deleted_at: now });
        await supabase.from('recipes').update({ deleted_at: now }).eq('id', req.recipe_id);
      }
    } else if (req.request_type === 'promote_to_global') {
      // Send it back to being a personal draft so the owner can revise and resubmit.
      await db.recipes.update(req.recipe_id, { visibility: 'personal' });
      await supabase.from('recipes').update({ visibility: 'personal' }).eq('id', req.recipe_id);
    }

    await db.approval_requests.update(req.id, { status: decision, resolved_at: now });
    await supabase.from('approval_requests').update({ status: decision, resolved_at: now }).eq('id', req.id);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    const { error } = await supabase.from('admins').insert({ email, added_by: user?.email ?? null });
    if (error) {
      showToast(error.code === '23505' ? 'That email is already an admin.' : 'Failed to add admin.');
      return;
    }
    setNewAdminEmail('');
    showToast(`${email} added as admin.`);
    loadAdmins();
  };

  const handleRemoveAdmin = (email: string) => {
    setDialog({
      title: 'Remove Admin',
      message: `Remove admin access for ${email}? They'll immediately lose access to this dashboard.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from('admins').delete().eq('email', email);
        setDialog(null);
        if (error) {
          showToast('Failed to remove admin.');
          return;
        }
        showToast(`${email} removed.`);
        loadAdmins();
      },
    });
  };

  if (!user) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">Sign in to view the Admin dashboard</h2>
      </div>
    );
  }

  if (!isAdminChecked) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 text-slate-400">
        Checking access...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-red-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">You don't have access to this page</h2>
        <p className="text-slate-500 mt-2">This area is restricted to family vault admins.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 md:p-12 bg-slate-50">
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex items-center gap-4">
          <div className="bg-orange-100 p-3 rounded-full text-orange-600">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Admin Review</h1>
            <p className="text-slate-600 mt-1">Approve or reject pending requests for the global vault.</p>
          </div>
        </div>

        {!pendingRequests || pendingRequests.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
            <ChefHat className="w-10 h-10 text-slate-200 mx-auto mb-4" />
            No pending requests right now.
          </div>
        ) : (
          <ul className="space-y-4">
            {pendingRequests.map((req) => {
              const meta = REQUEST_META[req.request_type];
              const Icon = meta.icon;
              return (
                <li key={req.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <span className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full ${meta.color}`}>
                          <Icon className="w-3.5 h-3.5" /> {meta.label}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(req.created_at as string).toLocaleString()}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-900">
                        {req.recipe?.title || 'Recipe not found (may have been deleted locally)'}
                      </h3>

                      {req.request_type === 'edit_global' && req.proposed_changes && (
                        <div className="mt-3 text-sm bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <p className="text-slate-500 mb-1">Proposed changes:</p>
                          <pre className="whitespace-pre-wrap text-slate-700 font-mono text-xs">
                            {JSON.stringify(req.proposed_changes, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => resolveRequest(req, 'approved')}
                        className="flex items-center gap-2 text-sm bg-green-50 text-green-700 border border-green-100 px-4 py-2 rounded-lg font-semibold hover:bg-green-600 hover:text-white transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Approve
                      </button>
                      <button
                        onClick={() => resolveRequest(req, 'rejected')}
                        className="flex items-center gap-2 text-sm bg-red-50 text-red-700 border border-red-100 px-4 py-2 rounded-lg font-semibold hover:bg-red-600 hover:text-white transition-colors"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Admin management: add/remove who has access to this page and the approval pipeline. */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 p-4 border-b border-slate-200 flex items-center gap-3">
            <Users className="w-6 h-6 text-slate-600" />
            <h2 className="text-xl font-bold text-slate-800">Admins</h2>
          </div>
          <div className="p-6 space-y-4">
            <form onSubmit={handleAddAdmin} className="flex gap-2">
              <input
                type="email"
                required
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="family.member@example.com"
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50 focus:bg-white transition-colors"
              />
              <button
                type="submit"
                className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" /> Add
              </button>
            </form>

            {!admins || admins.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">No admins found.</p>
            ) : (
              <ul className="space-y-2">
                {admins.map((a) => (
                  <li key={a.email} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-sm font-medium text-slate-700">{a.email}</span>
                    <button
                      onClick={() => handleRemoveAdmin(a.email)}
                      disabled={admins.length <= 1}
                      title={admins.length <= 1 ? "Can't remove the last admin" : 'Remove admin'}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.confirmLabel}
        danger={dialog?.danger}
        onConfirm={() => dialog?.onConfirm()}
        onCancel={() => setDialog(null)}
      />
      <Toast message={toast} />
    </div>
  );
}
