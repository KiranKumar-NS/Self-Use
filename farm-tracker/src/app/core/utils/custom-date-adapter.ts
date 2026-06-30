import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class CustomDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: object): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = MONTH_NAMES[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  override parse(value: any): Date | null {
    if (typeof value === 'string' && value) {
      // Support parsing "dd-MMM-yyyy" format
      const parts = value.split('-');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const monthIndex = MONTH_NAMES.findIndex(m => m.toLowerCase() === parts[1].toLowerCase());
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && monthIndex !== -1 && !isNaN(year)) {
          return new Date(year, monthIndex, day);
        }
      }
    }
    return super.parse(value);
  }
}
