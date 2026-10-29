import {
  ChangeDetectionStrategy, Component, HostListener, OnDestroy, SecurityContext, effect, inject, input, output, signal, untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { Timestamp } from '@angular/fire/firestore';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NoteService } from '../../../core/services/note.service';
import { ToastService } from '../../../core/services/toast.service';
import { MarketDetails, MedicineDetails, NOTE_CATEGORIES, Note, NoteCategory } from '../../../core/models/note.model';
import { RichTextChange, RichTextEditorComponent, escapeHtml } from '../rich-text-editor/rich-text-editor.component';
import { NOTE_CONTENT_CSS } from '../note-content-styles.component';

const AUTOSAVE_MS = 1500;

@Component({
  selector: 'app-note-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, RichTextEditorComponent,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatChipsModule,
    MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule,
  ],
  template: `
    <div class="editor-head">
      <button mat-icon-button class="back-btn" (click)="back.emit()" aria-label="Back to list"><mat-icon>arrow_back</mat-icon></button>
      <span class="save-state" [class.error]="saveError()">
        @if (saving()) { Saving… }
        @else if (saveError()) { <mat-icon>error</mat-icon> Not saved — <a (click)="saveNow()">retry</a> }
        @else if (dirty()) { Unsaved changes }
        @else if (note().updatedAt) { Saved · {{ note().updatedAt.toDate() | date:'d MMM y, h:mm a' }} }
      </span>
      <span class="spacer"></span>
      <button mat-icon-button [matTooltip]="pinned() ? 'Unpin' : 'Pin to top'" (click)="togglePin()">
        <mat-icon [class.pinned]="pinned()">push_pin</mat-icon>
      </button>
      <button mat-icon-button matTooltip="Print / Save as PDF" (click)="print()"><mat-icon>print</mat-icon></button>
      <button mat-icon-button [matMenuTriggerFor]="more" aria-label="More actions"><mat-icon>more_vert</mat-icon></button>
      <mat-menu #more="matMenu">
        <button mat-menu-item (click)="duplicateNote()"><mat-icon>content_copy</mat-icon> Duplicate</button>
        <button mat-menu-item (click)="copyText()"><mat-icon>content_paste</mat-icon> Copy as text</button>
        <button mat-menu-item (click)="trash()"><mat-icon>delete</mat-icon> Move to Trash</button>
      </mat-menu>
    </div>

    <input class="title-input" placeholder="Title" [ngModel]="title()" (ngModelChange)="title.set($event); touch()" />

    <div class="meta-row">
      <mat-form-field appearance="outline" class="cat-field" subscriptSizing="dynamic">
        <mat-label>Category</mat-label>
        <mat-select [ngModel]="category()" (ngModelChange)="category.set($event); touch()">
          @for (c of categories; track c.key) {
            <mat-option [value]="c.key"><mat-icon [style.color]="c.color">{{ c.icon }}</mat-icon> {{ c.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="tag-field" subscriptSizing="dynamic">
        <mat-label>Tags</mat-label>
        <mat-chip-grid #chipGrid>
          @for (t of tags(); track t) {
            <mat-chip-row (removed)="removeTag(t)">{{ t }}<button matChipRemove [attr.aria-label]="'Remove ' + t"><mat-icon>cancel</mat-icon></button></mat-chip-row>
          }
        </mat-chip-grid>
        <input placeholder="Add tag…" [matChipInputFor]="chipGrid" [matChipInputSeparatorKeyCodes]="separators"
          [matChipInputAddOnBlur]="true" (matChipInputTokenEnd)="addTag($event)" />
      </mat-form-field>
    </div>

    @if (category() === 'medicine') {
      <div class="details">
        <div class="details-title"><mat-icon>medication</mat-icon> Medicine details</div>
        <div class="grid">
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Medicine name</mat-label><input matInput [ngModel]="medicine().name" (ngModelChange)="setMed('name', $event)" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Purpose / used for</mat-label><input matInput [ngModel]="medicine().purpose" (ngModelChange)="setMed('purpose', $event)" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Animal</mat-label><input matInput [ngModel]="medicine().animal" (ngModelChange)="setMed('animal', $event)" placeholder="Goat, sheep, poultry…" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Dosage</mat-label><input matInput [ngModel]="medicine().dosage" (ngModelChange)="setMed('dosage', $event)" placeholder="e.g. 1 ml / 10 kg" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>How given</mat-label>
            <mat-select [ngModel]="medicine().route" (ngModelChange)="setMed('route', $event)">
              @for (r of routes; track r) { <mat-option [value]="r">{{ r }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Withdrawal period (days)</mat-label><input matInput type="number" min="0" [ngModel]="medicine().withdrawalDays" (ngModelChange)="setMed('withdrawalDays', num($event))" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Brand / supplier</mat-label><input matInput [ngModel]="medicine().supplier" (ngModelChange)="setMed('supplier', $event)" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Cost (₹)</mat-label><input matInput type="number" min="0" [ngModel]="medicine().cost" (ngModelChange)="setMed('cost', num($event))" /></mat-form-field>
        </div>
      </div>
    }

    @if (category() === 'market') {
      <div class="details">
        <div class="details-title"><mat-icon>storefront</mat-icon> Market / breed details</div>
        <div class="grid">
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Breed</mat-label><input matInput [ngModel]="market().breed" (ngModelChange)="setMkt('breed', $event)" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Animal</mat-label><input matInput [ngModel]="market().animal" (ngModelChange)="setMkt('animal', $event)" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Market / place</mat-label><input matInput [ngModel]="market().marketName" (ngModelChange)="setMkt('marketName', $event)" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Price (₹)</mat-label><input matInput type="number" min="0" [ngModel]="market().pricePerUnit" (ngModelChange)="setMkt('pricePerUnit', num($event))" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Per</mat-label>
            <mat-select [ngModel]="market().unit || 'kg'" (ngModelChange)="setMkt('unit', $event)">
              <mat-option value="kg">kg (live weight)</mat-option>
              <mat-option value="head">head</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Observed on</mat-label><input matInput type="date" [ngModel]="market().observedOn" (ngModelChange)="setMkt('observedOn', $event)" /></mat-form-field>
        </div>
      </div>
    }

    <app-rich-text-editor [docKey]="note().id" [html]="note().contentHtml" [placeholder]="placeholderFor(category())" (changed)="onContent($event)" />
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 10px; }
    .editor-head { display: flex; align-items: center; gap: 4px; min-height: 40px; }
    .back-btn { display: none; }
    .spacer { flex: 1; }
    .save-state { font-size: 0.78rem; color: var(--color-text-muted); display: inline-flex; align-items: center; gap: 4px; }
    .save-state.error { color: var(--color-danger); }
    .save-state mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .save-state a { cursor: pointer; text-decoration: underline; }
    .pinned { color: var(--color-warning); }
    .title-input { border: none; outline: none; background: transparent; font-size: 1.5rem; font-weight: 700; color: var(--color-text); padding: 4px 2px; width: 100%; }
    .meta-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .cat-field { width: 220px; }
    .tag-field { flex: 1; min-width: 220px; }
    mat-option mat-icon { vertical-align: middle; }
    .details { border: 1px dashed var(--color-border); border-radius: 8px; padding: 10px 12px; background: var(--color-bg); }
    .details-title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.85rem; color: var(--color-text-subtle); margin-bottom: 8px; }
    .details-title mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
    @media (max-width: 900px) {
      .back-btn { display: inline-flex; }
      .cat-field, .tag-field { width: 100%; min-width: 0; flex: 1 1 100%; }
      .title-input { font-size: 1.25rem; }
    }
  `],
})
export class NoteEditorComponent implements OnDestroy {
  private noteService = inject(NoteService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  note = input.required<Note>();
  updated = output<Note>();
  trashed = output<string>();
  duplicated = output<Note>();
  back = output<void>();

  readonly categories = NOTE_CATEGORIES;
  readonly separators = [ENTER, COMMA] as const;
  readonly routes = ['Oral', 'Injection (IM)', 'Injection (SC)', 'Injection (IV)', 'Topical / spray', 'Drench', 'In feed / water', 'Other'];

  title = signal('');
  category = signal<NoteCategory>('general');
  tags = signal<string[]>([]);
  pinned = signal(false);
  medicine = signal<MedicineDetails>({});
  market = signal<MarketDetails>({});
  private html = '';
  private text = '';

  dirty = signal(false);
  saving = signal(false);
  saveError = signal(false);

  private loadedId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const n = this.note();
      untracked(() => {
        if (n.id === this.loadedId) return;
        // Switching notes: flush the previous one before loading the next.
        if (this.dirty()) void this.saveNow();
        this.load(n);
      });
    });
  }

  ngOnDestroy(): void {
    if (this.dirty()) void this.saveNow();
  }

  /** Autosave flushes on leave, so only a failed save counts as unsaved. */
  hasUnsavedChanges(): boolean {
    return this.saveError();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void this.saveNow();
    }
  }

  private load(n: Note): void {
    this.loadedId = n.id;
    this.title.set(n.title || '');
    this.category.set(n.category);
    this.tags.set([...(n.tags || [])]);
    this.pinned.set(!!n.pinned);
    this.medicine.set({ ...(n.medicine || {}) });
    this.market.set({ ...(n.market || {}) });
    this.html = n.contentHtml || '';
    this.text = n.contentText || '';
    this.dirty.set(false);
    this.saveError.set(false);
  }

  touch(): void {
    this.dirty.set(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.saveNow(), AUTOSAVE_MS);
  }

  onContent(c: RichTextChange): void {
    this.html = c.html;
    this.text = c.text;
    this.touch();
  }

  setMed<K extends keyof MedicineDetails>(key: K, value: MedicineDetails[K]): void {
    this.medicine.update(m => ({ ...m, [key]: value }));
    this.touch();
  }

  setMkt<K extends keyof MarketDetails>(key: K, value: MarketDetails[K]): void {
    this.market.update(m => ({ ...m, [key]: value }));
    this.touch();
  }

  num(v: unknown): number | null {
    return v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
  }

  addTag(e: MatChipInputEvent): void {
    const v = (e.value || '').trim().toLowerCase();
    if (v && !this.tags().includes(v)) {
      this.tags.update(t => [...t, v]);
      this.touch();
    }
    e.chipInput.clear();
  }

  removeTag(tag: string): void {
    this.tags.update(t => t.filter(x => x !== tag));
    this.touch();
  }

  togglePin(): void {
    this.pinned.update(p => !p);
    void this.saveNow();
  }

  /** Snapshot is taken synchronously so a note switch can't mix fields between notes. */
  private snapshot(): Partial<Note> {
    const category = this.category();
    return {
      title: this.title().trim(),
      category,
      tags: this.tags(),
      pinned: this.pinned(),
      contentHtml: this.html,
      contentText: this.text,
      medicine: category === 'medicine' ? clean(this.medicine()) : (this.note().medicine ?? null),
      market: category === 'market' ? clean(this.market()) : (this.note().market ?? null),
    };
  }

  async saveNow(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const id = this.loadedId;
    if (!id) return;
    const base = this.note().id === id ? this.note() : null;
    const data = this.snapshot();
    this.dirty.set(false);
    this.saving.set(true);
    try {
      await this.noteService.update(id, data);
      if (this.loadedId === id) this.saveError.set(false);
      if (base) this.updated.emit({ ...base, ...data, updatedAt: Timestamp.now() } as Note);
    } catch (err) {
      console.error('Note save failed', err);
      if (this.loadedId === id) { this.saveError.set(true); this.dirty.set(true); }
      this.toast.error('Could not save note. Check your connection.');
    } finally {
      this.saving.set(false);
    }
  }

  async duplicateNote(): Promise<void> {
    await this.saveNow();
    try {
      const copy = await this.noteService.create({ ...this.snapshot(), title: `${this.title() || 'Untitled'} (copy)`, pinned: false, category: this.category() });
      this.duplicated.emit(copy);
      this.toast.success('Note duplicated');
    } catch {
      this.toast.error('Could not duplicate note');
    }
  }

  async copyText(): Promise<void> {
    try {
      await navigator.clipboard.writeText([this.title(), this.detailsText(), this.text].filter(Boolean).join('\n\n'));
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Copy not allowed by the browser');
    }
  }

  trash(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    // Save pending edits first so a restore brings back the latest text.
    const id = this.note().id;
    void (this.dirty() ? this.saveNow() : Promise.resolve()).then(() => this.trashed.emit(id));
  }

  print(): void {
    const w = window.open('', '_blank');
    if (!w) { this.toast.error('Allow pop-ups to print'); return; }
    const cat = NOTE_CATEGORIES.find(c => c.key === this.category())?.label ?? '';
    const body = this.sanitizer.sanitize(SecurityContext.HTML, this.html) ?? '';
    const details = this.detailsText();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(this.title() || 'Note')}</title>
      <style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.6}
      .meta{color:#64748b;font-size:12px;margin-bottom:12px}.details{white-space:pre-line;background:#f1f5f9;padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:12px}
      ${NOTE_CONTENT_CSS}</style></head><body>
      <h1>${escapeHtml(this.title() || 'Untitled')}</h1>
      <div class="meta">${escapeHtml(cat)}${this.tags().length ? ' · ' + escapeHtml(this.tags().join(', ')) : ''} · ${new Date().toLocaleDateString()}</div>
      ${details ? `<div class="details">${escapeHtml(details)}</div>` : ''}
      <div class="note-content">${body}</div></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  private detailsText(): string {
    if (this.category() === 'medicine') {
      const m = this.medicine();
      return [
        m.name && `Medicine: ${m.name}`, m.purpose && `Purpose: ${m.purpose}`, m.animal && `Animal: ${m.animal}`,
        m.dosage && `Dosage: ${m.dosage}`, m.route && `Given: ${m.route}`,
        m.withdrawalDays != null && `Withdrawal: ${m.withdrawalDays} days`, m.supplier && `Brand/supplier: ${m.supplier}`,
        m.cost != null && `Cost: ₹${m.cost}`,
      ].filter(Boolean).join('\n');
    }
    if (this.category() === 'market') {
      const m = this.market();
      return [
        m.breed && `Breed: ${m.breed}`, m.animal && `Animal: ${m.animal}`, m.marketName && `Market: ${m.marketName}`,
        m.pricePerUnit != null && `Price: ₹${m.pricePerUnit} / ${m.unit || 'kg'}`, m.observedOn && `Observed on: ${m.observedOn}`,
      ].filter(Boolean).join('\n');
    }
    return '';
  }

  placeholderFor(c: NoteCategory): string {
    switch (c) {
      case 'learning': return 'What did you learn? Source, key points, what to try…';
      case 'experience': return 'What happened, what worked, what didn\'t, what to do next time…';
      case 'medicine': return 'Symptoms treated, schedule, results, precautions…';
      case 'market': return 'Rates seen, demand, buyer behaviour, breed traits…';
      case 'feed': return 'Feed mix, quantities, cost, effect on growth…';
      case 'contacts': return 'Vets, dealers, buyers, suppliers — name, phone, notes…';
      default: return 'Start writing…';
    }
  }
}

/** Drop empty strings / nulls so Firestore docs stay tidy. */
function clean<T extends object>(o: T): T | null {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && v !== undefined)) as T;
  return Object.keys(out).length ? out : null;
}
