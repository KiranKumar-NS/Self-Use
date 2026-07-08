/**
 * Mock AuthService for use in tests.
 *
 * Usage:
 *   { provide: AuthService, useValue: createMockAuthService() }
 */
import { signal, computed } from '@angular/core';
import type { AppUser, UserRole } from '../core/models/user.model';

export function createMockAuthService(overrides: Record<string, any> = {}) {
  const role = signal<UserRole | null>(overrides['role'] ?? 'admin');
  const profile = signal<AppUser | null>(overrides['profile'] ?? {
    uid: 'test-uid',
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'admin',
    assignedSegments: ['seg1'],
    isActive: true,
    createdAt: { toDate: () => new Date() } as any,
    updatedAt: { toDate: () => new Date() } as any,
    createdBy: 'test-uid',
  });

  return {
    currentUser: signal(overrides['currentUser'] ?? { uid: 'test-uid' }),
    userProfile: profile,
    userRole: role,
    isLoading: signal(false),
    isAdmin: computed(() => role() === 'admin'),
    isManager: computed(() => role() === 'manager'),
    isViewer: computed(() => role() === 'viewer'),
    isLoggedIn: computed(() => true),
    assignedSegments: computed(() => profile()?.assignedSegments ?? []),
    hasSegmentAccess: vi.fn(() => true),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
