export interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  isActive: boolean;
  /** Segment ids this category applies to; empty/missing = all segments. */
  segments?: string[];
}

export const DEFAULT_CATEGORIES: Category[] = [
  // Expense categories
  { id: 'feed', name: 'Feed', type: 'expense', isActive: true },
  { id: 'medicine', name: 'Medicine', type: 'expense', isActive: true },
  { id: 'fertilizer', name: 'Fertilizer', type: 'expense', isActive: true },
  { id: 'seeds', name: 'Seeds', type: 'expense', isActive: true },
  { id: 'labor', name: 'Labor', type: 'expense', isActive: true },
  { id: 'transport', name: 'Transport', type: 'expense', isActive: true },
  { id: 'maintenance', name: 'Maintenance', type: 'expense', isActive: true },
  { id: 'loan-repayment', name: 'Loan Repayment', type: 'expense', isActive: true },
  { id: 'other-expense', name: 'Other', type: 'expense', isActive: true },
  // Income sources
  { id: 'milk', name: 'Milk', type: 'income', isActive: true },
  { id: 'eggs', name: 'Eggs', type: 'income', isActive: true },
  { id: 'animal-sales', name: 'Animal Sales', type: 'income', isActive: true },
  { id: 'crop-sales', name: 'Crop Sales', type: 'income', isActive: true },
  { id: 'fruit-sales', name: 'Fruit Sales', type: 'income', isActive: true },
  { id: 'other-income', name: 'Other', type: 'income', isActive: true },
];
