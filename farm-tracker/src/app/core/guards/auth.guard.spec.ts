import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

vi.mock('@angular/fire/auth', () => ({
  Auth: class {},
  onAuthStateChanged: vi.fn(),
}));

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

// We'll mock inject() to return our test doubles
let mockAuthService: any;
let mockRouter: any;

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual('@angular/core');
  return {
    ...actual as any,
    inject: vi.fn((token: any) => {
      if (token === AuthService) return mockAuthService;
      if (token === Router) return mockRouter;
      return {};
    }),
  };
});

import { authGuard } from './auth.guard';

describe('authGuard', () => {
  beforeEach(() => {
    mockAuthService = {
      whenReady: vi.fn(() => Promise.resolve()),
      currentUser: vi.fn(() => null),
      userProfile: vi.fn(() => null),
      logout: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
      createUrlTree: vi.fn((segments: string[]) => ({ _urlTree: segments })),
    };
  });

  it('should allow authenticated active user', async () => {
    mockAuthService.currentUser.mockReturnValue({ uid: 'test' });
    mockAuthService.userProfile.mockReturnValue({ isActive: true });

    const result = await authGuard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should redirect unauthenticated user to login', async () => {
    mockAuthService.currentUser.mockReturnValue(null);

    await authGuard({} as any, {} as any);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/auth/login']);
  });

  it('should logout and redirect inactive user', async () => {
    mockAuthService.currentUser.mockReturnValue({ uid: 'test' });
    mockAuthService.userProfile.mockReturnValue({ isActive: false });

    await authGuard({} as any, {} as any);
    expect(mockAuthService.logout).toHaveBeenCalled();
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/auth/login']);
  });

  it('should wait for auth readiness before deciding', async () => {
    let resolveReady!: () => void;
    mockAuthService.whenReady.mockReturnValue(new Promise<void>((r) => (resolveReady = r)));

    let settled = false;
    const promise = (authGuard({} as any, {} as any) as Promise<unknown>).then((r) => {
      settled = true;
      return r;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    mockAuthService.currentUser.mockReturnValue({ uid: 'test' });
    mockAuthService.userProfile.mockReturnValue({ isActive: true });
    resolveReady();

    const result = await promise;
    expect(result).toBe(true);
  });
});
