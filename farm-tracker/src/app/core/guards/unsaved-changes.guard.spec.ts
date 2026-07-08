import { unsavedChangesGuard, HasUnsavedChanges } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  it('should allow navigation when no unsaved changes', () => {
    const component: HasUnsavedChanges = {
      hasUnsavedChanges: () => false,
    };

    const result = unsavedChangesGuard(component, {} as any, {} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should show confirm dialog when unsaved changes exist', () => {
    const component: HasUnsavedChanges = {
      hasUnsavedChanges: () => true,
    };

    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const result = unsavedChangesGuard(component, {} as any, {} as any, {} as any);

    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Are you sure you want to leave?');
    expect(result).toBe(true);

    confirmSpy.mockRestore();
  });

  it('should block navigation when user cancels confirm', () => {
    const component: HasUnsavedChanges = {
      hasUnsavedChanges: () => true,
    };

    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    const result = unsavedChangesGuard(component, {} as any, {} as any, {} as any);

    expect(result).toBe(false);
    confirmSpy.mockRestore();
  });

  it('should allow navigation when component has no hasUnsavedChanges method', () => {
    const component = {} as any;
    const result = unsavedChangesGuard(component, {} as any, {} as any, {} as any);
    expect(result).toBe(true);
  });
});
