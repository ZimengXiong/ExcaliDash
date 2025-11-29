import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useRequireAdmin } from '../context/AuthContext';
import { api } from '../api';
import type { AdminStats, AdminUser } from '../types';
import { 
  Users, 
  FileText, 
  FolderOpen, 
  Activity, 
  Trash2, 
  Shield, 
  ShieldOff,
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Home,
  Settings,
  Pencil
} from 'lucide-react';
import { Logo } from '../components/Logo';

export const AdminDashboard: React.FC = () => {
  const { user, isLoading: authLoading } = useRequireAdmin();
  
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  
  // Modal state
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [modalAction, setModalAction] = useState<'delete' | 'deactivate' | 'activate' | 'promote' | 'demote' | 'resetPassword' | 'editProfile' | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Edit profile state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/admin/stats');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const params: any = { page: usersPage, limit: 10 };
      if (searchQuery) params.search = searchQuery;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.isActive = statusFilter;
      
      const response = await api.get('/admin/users', { params });
      setUsers(response.data.users);
      setUsersTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, [usersPage, searchQuery, roleFilter, statusFilter]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchStats(), fetchUsers()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchStats, fetchUsers]);

  const handleUserAction = async () => {
    if (!selectedUser || !modalAction) return;
    
    setActionLoading(true);
    setActionMessage(null);

    try {
      switch (modalAction) {
        case 'delete':
          await api.delete(`/admin/users/${selectedUser.id}`);
          setActionMessage({ type: 'success', text: 'User deleted successfully' });
          break;
        case 'deactivate':
          await api.put(`/admin/users/${selectedUser.id}`, { isActive: false });
          setActionMessage({ type: 'success', text: 'User deactivated' });
          break;
        case 'activate':
          await api.put(`/admin/users/${selectedUser.id}`, { isActive: true });
          setActionMessage({ type: 'success', text: 'User activated' });
          break;
        case 'promote':
          await api.put(`/admin/users/${selectedUser.id}`, { role: 'ADMIN' });
          setActionMessage({ type: 'success', text: 'User promoted to admin' });
          break;
        case 'demote':
          await api.put(`/admin/users/${selectedUser.id}`, { role: 'USER' });
          setActionMessage({ type: 'success', text: 'User demoted to regular user' });
          break;
        case 'resetPassword':
          if (!newPassword || newPassword.length < 8) {
            setActionMessage({ type: 'error', text: 'Password must be at least 8 characters' });
            setActionLoading(false);
            return;
          }
          await api.post(`/admin/users/${selectedUser.id}/reset-password`, { password: newPassword });
          setActionMessage({ type: 'success', text: 'Password reset successfully' });
          break;
        case 'editProfile':
          await api.put(`/admin/users/${selectedUser.id}`, { 
            displayName: editDisplayName.trim() || null,
            email: editEmail.trim(),
          });
          setActionMessage({ type: 'success', text: 'Profile updated successfully' });
          break;
      }
      
      await Promise.all([fetchStats(), fetchUsers()]);
      setSelectedUser(null);
      setModalAction(null);
      setNewPassword('');
      setEditDisplayName('');
      setEditEmail('');
    } catch (error: any) {
      setActionMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Action failed' 
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCleanupSessions = async () => {
    try {
      const response = await api.post('/admin/cleanup-sessions');
      setActionMessage({ type: 'success', text: response.data.message });
      await fetchStats();
    } catch (error) {
      setActionMessage({ type: 'error', text: 'Failed to cleanup sessions' });
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const StatCard: React.FC<{ 
    icon: React.ReactNode; 
    label: string; 
    value: number | string;
    subValue?: string;
  }> = ({ icon, label, value, subValue }) => (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] p-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
          {icon}
        </div>
        <div>
          <p className="text-sm text-slate-600 dark:text-neutral-400">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-neutral-100">{value}</p>
          {subValue && (
            <p className="text-xs text-slate-500 dark:text-neutral-500">{subValue}</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-900 border-b-2 border-black dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo className="w-8 h-8" />
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-neutral-100">Admin Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Action Message */}
        {actionMessage && (
          <div className={`mb-4 p-3 rounded-lg border-2 flex items-center gap-2 ${
            actionMessage.type === 'success' 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-400' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-400'
          }`}>
            {actionMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {actionMessage.text}
            <button 
              onClick={() => setActionMessage(null)} 
              className="ml-auto hover:opacity-70"
            >
              ×
            </button>
          </div>
        )}

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard 
              icon={<Users className="w-5 h-5 text-indigo-600" />}
              label="Total Users"
              value={stats.users.total}
              subValue={`${stats.users.active} active, ${stats.users.inactive} inactive`}
            />
            <StatCard 
              icon={<FileText className="w-5 h-5 text-emerald-600" />}
              label="Total Drawings"
              value={stats.content.drawings}
            />
            <StatCard 
              icon={<FolderOpen className="w-5 h-5 text-amber-600" />}
              label="Total Collections"
              value={stats.content.collections}
            />
            <StatCard 
              icon={<Activity className="w-5 h-5 text-rose-600" />}
              label="Active Sessions"
              value={stats.sessions.active}
            />
          </div>
        )}

        {/* Users Section */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100">User Management</h2>
            <button
              onClick={handleCleanupSessions}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 rounded-lg border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] hover:-translate-y-0.5 transition-all text-sm font-bold"
            >
              <RotateCcw className="w-4 h-4" />
              Cleanup Sessions
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
            >
              <option value="">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="USER">User</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-black dark:border-neutral-700">
                  <th className="text-left py-3 px-4 font-bold text-slate-900 dark:text-neutral-100">User</th>
                  <th className="text-left py-3 px-4 font-bold text-slate-900 dark:text-neutral-100">Role</th>
                  <th className="text-left py-3 px-4 font-bold text-slate-900 dark:text-neutral-100">Status</th>
                  <th className="text-left py-3 px-4 font-bold text-slate-900 dark:text-neutral-100">Content</th>
                  <th className="text-right py-3 px-4 font-bold text-slate-900 dark:text-neutral-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-200 dark:border-neutral-800">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-neutral-100">{u.displayName || 'User'}</p>
                        <p className="text-sm text-slate-500 dark:text-neutral-500">{u.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        u.role === 'ADMIN' 
                          ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' 
                          : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        u.isActive 
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      }`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-neutral-400">
                      {u._count?.drawings || 0} drawings, {u._count?.collections || 0} collections
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-2">
                        {/* Edit Profile - available for all users */}
                        <button
                          onClick={() => { 
                            setSelectedUser(u); 
                            setModalAction('editProfile');
                            setEditDisplayName(u.displayName || '');
                            setEditEmail(u.email);
                          }}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-600 dark:text-neutral-400"
                          title="Edit Profile"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {u.id !== user?.id && (
                          <>
                            {u.isActive ? (
                              <button
                                onClick={() => { setSelectedUser(u); setModalAction('deactivate'); }}
                                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-600 dark:text-neutral-400"
                                title="Deactivate"
                              >
                                <ShieldOff className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => { setSelectedUser(u); setModalAction('activate'); }}
                                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-600 dark:text-neutral-400"
                                title="Activate"
                              >
                                <Shield className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => { setSelectedUser(u); setModalAction('resetPassword'); }}
                              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-600 dark:text-neutral-400"
                              title="Reset Password"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setSelectedUser(u); setModalAction('delete'); }}
                              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {usersTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                disabled={usersPage === 1}
                className="p-2 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600 dark:text-neutral-400">
                Page {usersPage} of {usersTotalPages}
              </span>
              <button
                onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                disabled={usersPage === usersTotalPages}
                className="p-2 rounded hover:bg-slate-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Recent Users */}
        {stats?.recentUsers && stats.recentUsers.length > 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100 mb-4">Recently Registered</h2>
            <div className="space-y-3">
              {stats.recentUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-neutral-800 last:border-0">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-neutral-100">{u.displayName || 'User'}</p>
                    <p className="text-sm text-slate-500 dark:text-neutral-500">{u.email}</p>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-neutral-600">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {selectedUser && modalAction && modalAction !== 'resetPassword' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-neutral-100">
                {modalAction === 'delete' && 'Delete User'}
                {modalAction === 'deactivate' && 'Deactivate User'}
                {modalAction === 'activate' && 'Activate User'}
                {modalAction === 'promote' && 'Promote to Admin'}
                {modalAction === 'demote' && 'Demote to User'}
              </h2>
            </div>
            <p className="text-slate-600 dark:text-neutral-400 mb-6">
              {modalAction === 'delete' && `Are you sure you want to delete "${selectedUser.username}"? This will permanently remove all their data.`}
              {modalAction === 'deactivate' && `Are you sure you want to deactivate "${selectedUser.username}"?`}
              {modalAction === 'activate' && `Are you sure you want to activate "${selectedUser.username}"?`}
              {modalAction === 'promote' && `Are you sure you want to promote "${selectedUser.username}" to admin?`}
              {modalAction === 'demote' && `Are you sure you want to demote "${selectedUser.username}" to regular user?`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setSelectedUser(null); setModalAction(null); }}
                className="px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleUserAction}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 text-white font-bold flex items-center gap-2 ${
                  modalAction === 'delete' || modalAction === 'deactivate' || modalAction === 'demote'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                } disabled:opacity-50`}
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {selectedUser && modalAction === 'resetPassword' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-slate-900 dark:text-neutral-100 mb-4">
              Reset Password
            </h2>
            <p className="text-slate-600 dark:text-neutral-400 mb-4">
              Enter a new password for "{selectedUser.username}".
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full px-4 py-2 mb-4 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setSelectedUser(null); setModalAction(null); setNewPassword(''); }}
                className="px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleUserAction}
                disabled={actionLoading || newPassword.length < 8}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white border-2 border-black dark:border-neutral-700 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 font-bold"
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {selectedUser && modalAction === 'editProfile' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-slate-900 dark:text-neutral-100 mb-4">
              Edit Profile
            </h2>
            <p className="text-slate-600 dark:text-neutral-400 mb-4">
              Edit profile for "{selectedUser.email}".
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  className="w-full px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Enter email"
                  className="w-full px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => { setSelectedUser(null); setModalAction(null); setEditDisplayName(''); setEditEmail(''); }}
                className="px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleUserAction}
                disabled={actionLoading || !editEmail.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white border-2 border-black dark:border-neutral-700 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 font-bold"
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
