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
      isLoading: vi.fn(() => false),
      currentUser: vi.fn(() => null),
      userProfile: vi.fn(() => null),
      logout: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
      createUrlTree: vi.fn((segments: string[]) => ({ _urlTree: segments })),
    };
  });

  it('should allow authenticated active user', () => {
    mockAuthService.currentUser.mockReturnValue({ uid: 'test' });
    mockAuthService.userProfile.mockReturnValue({ isActive: true });

    const result = authGuard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should redirect unauthenticated user to login', () => {
    mockAuthService.currentUser.mockReturnValue(null);

    const result = authGuard({} as any, {} as any);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/auth/login']);
  });

  it('should logout and redirect inactive user', () => {
    mockAuthService.currentUser.mockReturnValue({ uid: 'test' });
    mockAuthService.userProfile.mockReturnValue({ isActive: false });

    authGuard({} as any, {} as any);
    expect(mockAuthService.logout).toHaveBeenCalled();
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/auth/login']);
  });

  it('should return a promise when loading', () => {
    mockAuthService.isLoading.mockReturnValue(true);

    const result = authGuard({} as any, {} as any);
    expect(result).toBeInstanceOf(Promise);
  });
});
