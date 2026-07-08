'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AdminOperations } from './admin-operations';

const AdminOperationsContext = createContext<AdminOperations | null>(null);

export function AdminOperationsProvider({
  operations,
  children,
}: {
  operations: AdminOperations;
  children: ReactNode;
}) {
  return (
    <AdminOperationsContext.Provider value={operations}>{children}</AdminOperationsContext.Provider>
  );
}

export function useAdminOperations(): AdminOperations {
  const operations = useContext(AdminOperationsContext);
  if (!operations) {
    throw new Error('useAdminOperations must be used within an AdminOperationsProvider');
  }
  return operations;
}
