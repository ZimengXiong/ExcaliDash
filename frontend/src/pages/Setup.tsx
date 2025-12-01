import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Eye, EyeOff, Loader2, Check, X, Shield } from 'lucide-react';
import { getSetupStatus, createAdminAccount, api } from '../api';

export const Setup: React.FC = () => {
  const navigate = useNavigate();
  
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check if setup is needed
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const status = await getSetupStatus();
        setNeedsSetup(status.needsSetup);
        if (!status.needsSetup) {
          // Setup already complete, redirect to login
          navigate('/login');
        }
      } catch (err) {
        console.error('Failed to check setup status:', err);
        setError('Failed to connect to server. Please try again.');
      } finally {
        setIsCheckingSetup(false);
      }
    };

    checkSetup();
  }, [navigate]);

  // Password validation
  const passwordChecks = {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password === confirmPassword;

  // Username validation
  const isUsernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username);

  // Email validation
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isEmailValid) {
      setError('Please enter a valid email address');
      return;
    }

    if (!isUsernameValid) {
      setError('Username must be 3-30 characters, letters, numbers, and underscores only');
      return;
    }

    if (!isPasswordValid) {
      setError('Password does not meet requirements');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const result = await createAdminAccount({
        email,
        username,
        password,
        displayName: displayName || undefined,
      });

      // Save token to localStorage
      localStorage.setItem('excalidash_token', result.token);
      localStorage.setItem('excalidash_user', JSON.stringify(result.user));
      
      // Set token for future API calls
      api.defaults.headers.common['Authorization'] = `Bearer ${result.token}`;

      // Navigate to dashboard
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create admin account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-neutral-950">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!needsSetup) {
    return null; // Will redirect to login
  }

  const PasswordCheck: React.FC<{ passed: boolean; label: string }> = ({ passed, label }) => (
    <div className={`flex items-center gap-2 text-xs ${passed ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-neutral-500'}`}>
      {passed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-neutral-950 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo className="w-16 h-16" />
        </div>

        {/* Setup Card */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] p-8">
          {/* Admin Badge */}
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium">
              <Shield className="w-4 h-4" />
              Initial Setup
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100 mb-2 text-center">
            Welcome to ExcaliDash
          </h1>
          <p className="text-sm text-slate-600 dark:text-neutral-400 mb-6 text-center">
            Create your admin account to get started
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-4 py-2 rounded-lg border-2 ${
                  email && !isEmailValid
                    ? 'border-red-500'
                    : 'border-black dark:border-neutral-700'
                } bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]`}
                placeholder="admin@example.com"
                required
              />
            </div>

            <div>
              <label 
                htmlFor="username" 
                className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className={`w-full px-4 py-2 rounded-lg border-2 ${
                  username && !isUsernameValid 
                    ? 'border-red-500' 
                    : 'border-black dark:border-neutral-700'
                } bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]`}
                placeholder="admin"
                required
              />
              {username && !isUsernameValid && (
                <p className="mt-1 text-xs text-red-500">3-30 characters, letters, numbers, and underscores only</p>
              )}
            </div>

            <div>
              <label 
                htmlFor="displayName" 
                className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1"
              >
                Display Name <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]"
                placeholder="Administrator"
              />
            </div>

            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-10 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <div className="mt-2 space-y-1">
                  <PasswordCheck passed={passwordChecks.length} label="At least 8 characters" />
                  <PasswordCheck passed={passwordChecks.letter} label="Contains a letter" />
                  <PasswordCheck passed={passwordChecks.number} label="Contains a number" />
                </div>
              )}
            </div>

            <div>
              <label 
                htmlFor="confirmPassword" 
                className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-4 py-2 rounded-lg border-2 ${
                  confirmPassword && !passwordsMatch 
                    ? 'border-red-500' 
                    : 'border-black dark:border-neutral-700'
                } bg-white dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]`}
                placeholder="Confirm password"
                required
              />
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !isEmailValid || !isUsernameValid || !isPasswordValid || !passwordsMatch}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Create Admin Account
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 dark:text-neutral-500 mt-6">
          This admin account will have full access to manage the application.
        </p>
      </div>
    </div>
  );
};
