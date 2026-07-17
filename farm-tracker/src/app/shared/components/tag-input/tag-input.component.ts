import { ChangeDetectionStrategy, Component, ElementRef, OnInit, inject, input, model, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TagService } from '../../../core/services/tag.service';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatChipsModule, MatAutocompleteModule, MatIconModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>Tags (optional)</mat-label>
      <mat-chip-grid #chipGrid>
        @for (tag of tags(); track tag) {
          <mat-chip-row (removed)="removeTag(tag)">
            {{ tag }}
            <button matChipTrailingIcon type="button" class="chip-edit-btn"
              (mousedown)="$event.preventDefault()"
              (click)="editTag(tag)"
              [attr.aria-label]="'Edit tag ' + tag">
              <mat-icon>edit</mat-icon>
            </button>
            <button matChipRemove><mat-icon>cancel</mat-icon></button>
          </mat-chip-row>
        }
      </mat-chip-grid>
      <input matInput #tagInput
        [matChipInputFor]="chipGrid"
        [matChipInputSeparatorKeyCodes]="separatorKeys"
        [matChipInputAddOnBlur]="true"
        (matChipInputTokenEnd)="addCustomTag($event)"
        [matAutocomplete]="tagAuto"
        [(ngModel)]="inputValue"
        (ngModelChange)="filterSuggestions()"
        [placeholder]="placeholder()" />
      <mat-autocomplete #tagAuto="matAutocomplete" (optionSelected)="addSuggestedTag($event)">
        @for (s of filtered(); track s) {
          <mat-option [value]="s">
            <span class="option-row">
              <span class="option-text">{{ s }}</span>
              <button mat-icon-button type="button" class="option-edit-btn"
                (mousedown)="$event.preventDefault()"
                (click)="editSuggestion(s, $event)"
                [attr.aria-label]="'Edit tag ' + s">
                <mat-icon>edit</mat-icon>
              </button>
            </span>
          </mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: [`
    .full-width { width: 100%; }
    .option-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 8px;
    }
    .option-text {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .option-edit-btn {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      padding: 4px;
    }
    .option-edit-btn mat-icon,
    .chip-edit-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
    }
  `],
})
export class TagInputComponent implements OnInit {
  tags = model<string[]>([]);
  placeholder = input('Add tags...');

  private tagService = inject(TagService);

  readonly separatorKeys = [ENTER, COMMA];
  inputValue = signal('');
  filtered = signal<string[]>([]);
  private allSuggestions: string[] = [];
  private tagInput = viewChild.required<ElementRef<HTMLInputElement>>('tagInput');

  async ngOnInit() {
    this.allSuggestions = await this.tagService.getTags();
    this.filterSuggestions();
  }

  filterSuggestions() {
    const term = this.inputValue().trim().toLowerCase();
    const selected = new Set(this.tags().map((t) => t.toLowerCase()));
    let results = this.allSuggestions.filter((s) => !selected.has(s));
    if (term) {
      results = results.filter((s) => s.includes(term));
    }
    this.filtered.set(results);
  }

  addCustomTag(event: MatChipInputEvent) {
    const value = (event.value || '').trim().toLowerCase();
    if (value && !this.tags().includes(value)) {
      this.tags.update((tags) => [...tags, value]);
    }
    event.chipInput.clear();
    this.inputValue.set('');
    this.filterSuggestions();
  }

  addSuggestedTag(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value as string;
    if (value && !this.tags().includes(value)) {
      this.tags.update((tags) => [...tags, value]);
    }
    this.inputValue.set('');
    this.filterSuggestions();
  }

  removeTag(tag: string) {
    this.tags.update((tags) => tags.filter((t) => t !== tag));
    this.filterSuggestions();
  }

  editSuggestion(tag: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.inputValue.set(tag);
    this.filterSuggestions();
    this.tagInput().nativeElement.focus();
  }

  editTag(tag: string) {
    this.tags.update((tags) => tags.filter((t) => t !== tag));
    this.inputValue.set(tag);
    this.filterSuggestions();
    this.tagInput().nativeElement.focus();
  }
}
