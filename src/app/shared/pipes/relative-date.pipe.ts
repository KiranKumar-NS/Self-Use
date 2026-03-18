import { Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';

@Pipe({ name: 'relativeDate', standalone: true })
export class RelativeDatePipe implements PipeTransform {
  transform(value: Timestamp | Date | null | undefined): string {
    if (!value) return '';
    const date = value instanceof Timestamp ? value.toDate() : value;
    return formatDistanceToNow(date, { addSuffix: true });
  }
}
