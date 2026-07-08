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

import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  beforeEach(() => {
    mockAuthService = {
      isLoading: vi.fn(() => false),
      userRole: vi.fn(() => null),
    };

    mockRouter = {
      navigate: vi.fn(),
      createUrlTree: vi.fn((segments: string[]) => ({ _urlTree: segments })),
    };
  });

  it('should allow user with matching role', () => {
    mockAuthService.userRole.mockReturnValue('admin');
    const guard = roleGuard(['admin', 'manager']);
    const result = guard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should allow manager role when permitted', () => {
    mockAuthService.userRole.mockReturnValue('manager');
    const guard = roleGuard(['admin', 'manager']);
    const result = guard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should redirect viewer to dashboard when not allowed', () => {
    mockAuthService.userRole.mockReturnValue('viewer');
    const guard = roleGuard(['admin', 'manager']);
    guard({} as any, {} as any);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should redirect when role is null', () => {
    mockAuthService.userRole.mockReturnValue(null);
    const guard = roleGuard(['admin']);
    guard({} as any, {} as any);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should return promise when loading', () => {
    mockAuthService.isLoading.mockReturnValue(true);
    const guard = roleGuard(['admin']);
    const result = guard({} as any, {} as any);
    expect(result).toBeInstanceOf(Promise);
  });
});
