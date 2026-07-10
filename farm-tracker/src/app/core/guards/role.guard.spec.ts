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
      whenReady: vi.fn(() => Promise.resolve()),
      userRole: vi.fn(() => null),
    };

    mockRouter = {
      navigate: vi.fn(),
      createUrlTree: vi.fn((segments: string[]) => ({ _urlTree: segments })),
    };
  });

  it('should allow user with matching role', async () => {
    mockAuthService.userRole.mockReturnValue('admin');
    const guard = roleGuard(['admin', 'manager']);
    const result = await guard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should allow manager role when permitted', async () => {
    mockAuthService.userRole.mockReturnValue('manager');
    const guard = roleGuard(['admin', 'manager']);
    const result = await guard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should redirect viewer to dashboard when not allowed', async () => {
    mockAuthService.userRole.mockReturnValue('viewer');
    const guard = roleGuard(['admin', 'manager']);
    await guard({} as any, {} as any);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should redirect when role is null', async () => {
    mockAuthService.userRole.mockReturnValue(null);
    const guard = roleGuard(['admin']);
    await guard({} as any, {} as any);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should wait for auth readiness before checking the role', async () => {
    let resolveReady!: () => void;
    mockAuthService.whenReady.mockReturnValue(new Promise<void>((r) => (resolveReady = r)));

    const guard = roleGuard(['admin']);
    let settled = false;
    const promise = (guard({} as any, {} as any) as Promise<unknown>).then((r) => {
      settled = true;
      return r;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    mockAuthService.userRole.mockReturnValue('admin');
    resolveReady();

    const result = await promise;
    expect(result).toBe(true);
  });
});
