import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { deriveKey, hexToBytes, generateSalt, bytesToHex, hashPassword } from '../utils/crypto';
import * as api from '../api';

interface VaultState {
  isSetup: boolean;
  isUnlocked: boolean;
  isLoading: boolean;
  passwordHint: string | null;
  privateDrawingsCount: number;
}

interface VaultContextType extends VaultState {
  sessionKey: CryptoKey | null;
  salt: Uint8Array | null;
  checkVaultStatus: () => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  setupVault: (password: string, hint?: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  updateHint: (hint: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextType | null>(null);

// Auto-lock timeout in milliseconds (15 minutes)
const AUTO_LOCK_TIMEOUT = 15 * 60 * 1000;

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<VaultState>({
    isSetup: false,
    isUnlocked: false,
    isLoading: true,
    passwordHint: null,
    privateDrawingsCount: 0,
  });

  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [salt, setSalt] = useState<Uint8Array | null>(null);
  const autoLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset auto-lock timer on activity
  const resetAutoLockTimer = useCallback(() => {
    if (autoLockTimer.current) {
      clearTimeout(autoLockTimer.current);
    }
    if (state.isUnlocked) {
      autoLockTimer.current = setTimeout(() => {
        lock();
      }, AUTO_LOCK_TIMEOUT);
    }
  }, [state.isUnlocked]);

  // Set up activity listeners for auto-lock
  useEffect(() => {
    if (state.isUnlocked) {
      const handleActivity = () => resetAutoLockTimer();
      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('keydown', handleActivity);
      window.addEventListener('click', handleActivity);
      resetAutoLockTimer();

      return () => {
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('keydown', handleActivity);
        window.removeEventListener('click', handleActivity);
        if (autoLockTimer.current) {
          clearTimeout(autoLockTimer.current);
        }
      };
    }
  }, [state.isUnlocked, resetAutoLockTimer]);

  // Check vault status on mount
  const checkVaultStatus = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const status = await api.getVaultStatus();
      setState(prev => ({
        ...prev,
        isSetup: status.isSetup,
        passwordHint: status.hint || null,
        privateDrawingsCount: status.privateDrawingsCount || 0,
        isLoading: false,
      }));
      if (status.salt) {
        setSalt(hexToBytes(status.salt));
      }
    } catch (error) {
      console.error('Failed to check vault status:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    checkVaultStatus();
  }, [checkVaultStatus]);

  // Lock the vault
  const lock = useCallback(() => {
    setSessionKey(null);
    setState(prev => ({ ...prev, isUnlocked: false }));
    if (autoLockTimer.current) {
      clearTimeout(autoLockTimer.current);
      autoLockTimer.current = null;
    }
  }, []);

  // Unlock the vault with password
  const unlock = useCallback(async (password: string): Promise<boolean> => {
    try {
      // Hash the password the same way we did during setup
      const passwordHash = await hashPassword(password);
      
      // First verify the password with the server
      const result = await api.verifyVaultPassword(passwordHash);
      
      if (!result.success) {
        return false;
      }

      // Derive the encryption key client-side
      const saltBytes = hexToBytes(result.salt);
      const key = await deriveKey(password, saltBytes);
      
      setSalt(saltBytes);
      setSessionKey(key);
      setState(prev => ({ ...prev, isUnlocked: true }));
      resetAutoLockTimer();
      
      return true;
    } catch (error) {
      console.error('Failed to unlock vault:', error);
      return false;
    }
  }, [resetAutoLockTimer]);

  // Setup the vault with initial password
  const setupVault = useCallback(async (password: string, hint?: string): Promise<void> => {
    try {
      // Generate a new salt
      const newSalt = generateSalt();
      const saltHex = bytesToHex(newSalt);
      
      // Hash the password for server storage
      const passwordHash = await hashPassword(password);
      
      // Create vault on server
      await api.setupVault(passwordHash, saltHex, hint);
      
      // Derive the encryption key
      const key = await deriveKey(password, newSalt);
      
      setSalt(newSalt);
      setSessionKey(key);
      setState(prev => ({
        ...prev,
        isSetup: true,
        isUnlocked: true,
        passwordHint: hint || null,
      }));
      resetAutoLockTimer();
    } catch (error) {
      console.error('Failed to setup vault:', error);
      throw error;
    }
  }, [resetAutoLockTimer]);

  // Change vault password (requires re-encrypting all private drawings)
  const changePassword = useCallback(async (oldPassword: string, newPassword: string): Promise<void> => {
    try {
      // Hash the old password the same way we did during setup
      const oldPasswordHash = await hashPassword(oldPassword);
      
      // Verify old password first
      const verifyResult = await api.verifyVaultPassword(oldPasswordHash);
      if (!verifyResult.success) {
        throw new Error('Invalid current password');
      }

      // Derive old key for decryption
      const oldSalt = hexToBytes(verifyResult.salt);
      const oldKey = await deriveKey(oldPassword, oldSalt);

      // Generate new salt and derive new key
      const newSalt = generateSalt();
      const newSaltHex = bytesToHex(newSalt);
      const newKey = await deriveKey(newPassword, newSalt);
      const newPasswordHash = await hashPassword(newPassword);

      // Re-encrypt all private drawings
      await api.changeVaultPassword(newPasswordHash, newSaltHex, oldKey, newKey);

      // Update local state
      setSalt(newSalt);
      setSessionKey(newKey);
      
    } catch (error) {
      console.error('Failed to change password:', error);
      throw error;
    }
  }, []);

  // Update password hint
  const updateHint = useCallback(async (hint: string): Promise<void> => {
    try {
      await api.updateVaultHint(hint);
      setState(prev => ({ ...prev, passwordHint: hint }));
    } catch (error) {
      console.error('Failed to update hint:', error);
      throw error;
    }
  }, []);

  return (
    <VaultContext.Provider
      value={{
        ...state,
        sessionKey,
        salt,
        checkVaultStatus,
        unlock,
        lock,
        setupVault,
        changePassword,
        updateHint,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = (): VaultContextType => {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
};
