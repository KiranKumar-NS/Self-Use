import { ChangeDetectionStrategy, Component, OnInit, SecurityContext, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { Timestamp } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NoteService } from '../../../core/services/note.service';
import { ToastService } from '../../../core/services/toast.service';
import { NOTE_CATEGORIES, Note, NoteCategory, NoteCategoryDef } from '../../../core/models/note.model';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { safeLoad } from '../../../core/utils/async.utils';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { NoteEditorComponent } from '../note-editor/note-editor.component';
import { NoteContentStylesComponent, NOTE_CONTENT_CSS } from '../note-content-styles.component';
import { escapeHtml } from '../rich-text-editor/rich-text-editor.component';

type Filter = 'all' | NoteCategory | 'trash';

@Component({
  selector: 'app-notes-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, MatButtonModule, MatIconModule, MatTooltipModule,
    LoadingSpinnerComponent, EmptyStateComponent, NoteEditorComponent, NoteContentStylesComponent,
  ],
  template: `
    <app-note-content-styles />
    <div class="page-header">
      <div>
        <h1>Notes</h1>
        <p class="subtitle">Learning, experience, medicines, market &amp; breed notes</p>
      </div>
      <div class="head-actions">
        <button mat-stroked-button matTooltip="Download all notes as one document" (click)="exportAll()" [disabled]="!active().length">
          <mat-icon>download</mat-icon> <span class="btn-label">Export</span>
        </button>
        <button mat-flat-button color="primary" (click)="newNote()" [disabled]="creating()">
          <mat-icon>add</mat-icon> <span class="btn-label">New note</span>
        </button>
      </div>
    </div>

    <div class="chips">
      <button class="chip" [class.on]="filter() === 'all'" (click)="setFilter('all')">All <span class="count">{{ active().length }}</span></button>
      @for (c of categories; track c.key) {
        <button class="chip" [class.on]="filter() === c.key" (click)="setFilter(c.key)">
          <mat-icon [style.color]="c.color">{{ c.icon }}</mat-icon>{{ c.label }} <span class="count">{{ counts()[c.key] || 0 }}</span>
        </button>
      }
      <button class="chip" [class.on]="filter() === 'trash'" (click)="setFilter('trash')">
        <mat-icon>delete</mat-icon>Trash <span class="count">{{ trashed().length }}</span>
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <div class="layout" [class.has-selection]="!!selected()">
        <aside class="list-pane">
          <div class="search">
            <mat-icon>search</mat-icon>
            <input placeholder="Search notes, tags, medicines, breeds…" [ngModel]="search()" (ngModelChange)="search.set($event)" />
            @if (search()) { <button class="clear" (click)="search.set('')" aria-label="Clear search"><mat-icon>close</mat-icon></button> }
          </div>
          @if (tagFilter()) {
            <div class="tag-filter">Tag: <b>#{{ tagFilter() }}</b> <button (click)="tagFilter.set(null)" aria-label="Clear tag filter"><mat-icon>close</mat-icon></button></div>
          }
          @for (n of visible(); track n.id) {
            <div class="item" [class.sel]="n.id === selectedId()" (click)="select(n.id)" tabindex="0" (keydown.enter)="select(n.id)">
              <div class="item-top">
                <mat-icon class="cat-icon" [style.color]="cat(n.category).color">{{ cat(n.category).icon }}</mat-icon>
                <span class="item-title">{{ n.title || 'Untitled' }}</span>
                @if (n.pinned && !n.isDeleted) { <mat-icon class="pin">push_pin</mat-icon> }
              </div>
              <div class="snippet">{{ snippet(n) }}</div>
              <div class="item-foot">
                <span>{{ (n.isDeleted ? n.deletedAt : n.updatedAt)?.toDate() | date:'d MMM y' }}</span>
                @for (t of n.tags.slice(0, 3); track t) {
                  <a class="tag" (click)="$event.stopPropagation(); tagFilter.set(t)">#{{ t }}</a>
                }
              </div>
            </div>
          } @empty {
            <app-empty-state [icon]="filter() === 'trash' ? '🗑️' : '📝'"
              [title]="search() || tagFilter() ? 'No matching notes' : (filter() === 'trash' ? 'Trash is empty' : 'No notes yet')"
              [message]="filter() === 'trash' ? 'Deleted notes appear here and can be restored.' : 'Write down what you learn and experience on the farm.'"
              [actionLabel]="filter() === 'trash' || search() ? '' : 'New note'" (actionClick)="newNote()" />
          }
        </aside>

        <section class="editor-pane">
          @if (selected(); as n) {
            @if (n.isDeleted) {
              <div class="trash-bar">
                <button mat-icon-button class="back-btn" (click)="selectedId.set(null)" aria-label="Back"><mat-icon>arrow_back</mat-icon></button>
                <span>This note is in Trash.</span>
                <span class="spacer"></span>
                <button mat-stroked-button (click)="restore(n)"><mat-icon>restore</mat-icon> Restore</button>
                <button mat-flat-button color="warn" (click)="deleteForever(n)"><mat-icon>delete_forever</mat-icon> Delete forever</button>
              </div>
              <h2 class="preview-title">{{ n.title || 'Untitled' }}</h2>
              <div class="note-content preview" [innerHTML]="n.contentHtml"></div>
            } @else {
              <app-note-editor [note]="n" (updated)="onUpdated($event)" (trashed)="moveToTrash($event)"
                (duplicated)="onDuplicated($event)" (back)="selectedId.set(null)" />
            }
          } @else {
            <div class="placeholder">
              <mat-icon>edit_note</mat-icon>
              <p>Select a note or create a new one.</p>
            </div>
          }
        </section>
      </div>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .page-header h1 { margin: 0; }
    .subtitle { margin: 2px 0 0; color: var(--color-text-secondary); font-size: 0.85rem; }
    .head-actions { display: flex; gap: 8px; }
    .chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 10px; scrollbar-width: thin; }
    .chip { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-subtle); border-radius: 999px; padding: 4px 12px; font-size: 0.82rem; cursor: pointer; }
    .chip mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .chip.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
    .chip.on mat-icon { color: #fff !important; }
    .count { font-size: 0.72rem; opacity: 0.75; }
    .layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }
    .list-pane { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 8px; max-height: calc(100vh - 210px); overflow-y: auto; position: sticky; top: 8px; }
    .search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--color-border); border-radius: 8px; padding: 4px 8px; margin-bottom: 6px; background: var(--color-bg); }
    .search mat-icon { color: var(--color-text-muted); font-size: 20px; width: 20px; height: 20px; }
    .search input { flex: 1; border: none; outline: none; background: transparent; font-size: 0.88rem; padding: 4px 0; color: var(--color-text); min-width: 0; }
    .clear, .tag-filter button { border: none; background: none; cursor: pointer; display: inline-flex; padding: 0; color: var(--color-text-muted); }
    .tag-filter { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; padding: 2px 4px 6px; color: var(--color-text-subtle); }
    .tag-filter mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .item { padding: 8px 10px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; }
    .item:hover { background: var(--color-bg-alt); }
    .item.sel { background: var(--color-primary-light); border-color: var(--color-primary); }
    .item-top { display: flex; align-items: center; gap: 6px; }
    .cat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    .item-title { font-weight: 600; font-size: 0.9rem; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text); }
    .pin { font-size: 16px; width: 16px; height: 16px; color: var(--color-warning); }
    .snippet { font-size: 0.8rem; color: var(--color-text-secondary); margin: 2px 0 4px 24px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .item-foot { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.72rem; color: var(--color-text-muted); margin-left: 24px; }
    .tag { color: var(--color-primary); cursor: pointer; }
    .editor-pane { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 12px 16px; min-height: 420px; }
    .placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 380px; color: var(--color-text-muted); }
    .placeholder mat-icon { font-size: 48px; width: 48px; height: 48px; }
    .trash-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px; background: var(--color-warning-light); border-radius: 8px; font-size: 0.85rem; }
    .back-btn { display: none; }
    .spacer { flex: 1; }
    .preview-title { margin: 14px 0 6px; }
    .preview { line-height: 1.6; color: var(--color-text-subtle); }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .list-pane { max-height: none; position: static; }
      .layout.has-selection .list-pane { display: none; }
      .layout:not(.has-selection) .editor-pane { display: none; }
      .editor-pane { padding: 10px; }
      .back-btn { display: inline-flex; }
      .btn-label { display: none; }
    }
  `],
})
export class NotesPageComponent implements OnInit, HasUnsavedChanges {
  private noteService = inject(NoteService);
  private toast = inject(ToastService);
  private dialog = inject(MatDialog);
  private sanitizer = inject(DomSanitizer);

  private editor = viewChild(NoteEditorComponent);

  readonly categories = NOTE_CATEGORIES;
  private readonly catMap = new Map(NOTE_CATEGORIES.map(c => [c.key, c]));

  notes = signal<Note[]>([]);
  loading = signal(true);
  creating = signal(false);
  filter = signal<Filter>('all');
  search = signal('');
  tagFilter = signal<string | null>(null);
  selectedId = signal<string | null>(null);

  active = computed(() => this.notes().filter(n => !n.isDeleted));
  trashed = computed(() => this.notes().filter(n => n.isDeleted));

  counts = computed(() => {
    const out: Partial<Record<NoteCategory, number>> = {};
    for (const n of this.active()) out[n.category] = (out[n.category] || 0) + 1;
    return out;
  });

  visible = computed(() => {
    const f = this.filter();
    let list = f === 'trash' ? this.trashed() : f === 'all' ? this.active() : this.active().filter(n => n.category === f);
    const tag = this.tagFilter();
    if (tag) list = list.filter(n => n.tags?.includes(tag));
    const q = this.search().trim().toLowerCase();
    if (q) {
      const terms = q.split(/\s+/);
      list = list.filter(n => {
        const hay = searchText(n);
        return terms.every(t => hay.includes(t));
      });
    }
    const time = (n: Note) => (f === 'trash' ? n.deletedAt : n.updatedAt)?.toMillis?.() ?? 0;
    return [...list].sort((a, b) => (f !== 'trash' ? Number(!!b.pinned) - Number(!!a.pinned) : 0) || time(b) - time(a));
  });

  selected = computed(() => this.notes().find(n => n.id === this.selectedId()) ?? null);

  async ngOnInit(): Promise<void> {
    await safeLoad(this.loading, async () => {
      this.notes.set(await this.noteService.getAll());
    }, this.toast, 'Failed to load notes');
  }

  hasUnsavedChanges(): boolean {
    return this.editor()?.hasUnsavedChanges() ?? false;
  }

  cat(key: NoteCategory): NoteCategoryDef {
    return this.catMap.get(key) ?? NOTE_CATEGORIES[NOTE_CATEGORIES.length - 1];
  }

  snippet(n: Note): string {
    const parts: string[] = [];
    if (n.medicine?.name) parts.push(`${n.medicine.name}${n.medicine.purpose ? ' – ' + n.medicine.purpose : ''}`);
    if (n.market?.breed) parts.push(`${n.market.breed}${n.market.pricePerUnit != null ? ` ₹${n.market.pricePerUnit}/${n.market.unit || 'kg'}` : ''}`);
    parts.push(n.contentText || '');
    return parts.filter(Boolean).join(' · ').slice(0, 160) || 'No content';
  }

  setFilter(f: Filter): void {
    this.filter.set(f);
    const sel = this.selected();
    if (sel && (f === 'trash') !== sel.isDeleted) this.selectedId.set(null);
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  async newNote(): Promise<void> {
    const f = this.filter();
    const category: NoteCategory = f === 'all' || f === 'trash' ? 'general' : f;
    this.creating.set(true);
    try {
      const note = await this.noteService.create({ category });
      this.notes.update(list => [note, ...list]);
      if (f === 'trash') this.filter.set('all');
      this.search.set('');
      this.tagFilter.set(null);
      this.selectedId.set(note.id);
    } catch {
      this.toast.error('Could not create note');
    } finally {
      this.creating.set(false);
    }
  }

  onUpdated(note: Note): void {
    this.notes.update(list => list.map(n => (n.id === note.id ? note : n)));
  }

  onDuplicated(note: Note): void {
    this.notes.update(list => [note, ...list]);
    this.selectedId.set(note.id);
  }

  async moveToTrash(id: string): Promise<void> {
    try {
      await this.noteService.moveToTrash(id);
      this.notes.update(list => list.map(n => (n.id === id ? { ...n, isDeleted: true, deletedAt: Timestamp.now() } : n)));
      this.selectedId.set(null);
      this.toast.success('Moved to Trash');
    } catch {
      this.toast.error('Could not delete note');
    }
  }

  async restore(n: Note): Promise<void> {
    try {
      await this.noteService.restore(n.id);
      this.notes.update(list => list.map(x => (x.id === n.id ? { ...x, isDeleted: false, deletedAt: null, updatedAt: Timestamp.now() } : x)));
      this.filter.set('all');
      this.toast.success('Note restored');
    } catch {
      this.toast.error('Could not restore note');
    }
  }

  deleteForever(n: Note): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete forever', message: `Permanently delete "${n.title || 'Untitled'}"? This cannot be undone.`, confirmText: 'Delete' } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (!result?.confirmed) return;
      try {
        await this.noteService.deleteForever(n.id);
        this.notes.update(list => list.filter(x => x.id !== n.id));
        this.selectedId.set(null);
        this.toast.success('Note deleted');
      } catch {
        this.toast.error('Could not delete note');
      }
    });
  }

  /** One self-contained HTML file with every active note, grouped by category. */
  exportAll(): void {
    const sections = NOTE_CATEGORIES.map(c => {
      const notes = this.active().filter(n => n.category === c.key)
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      if (!notes.length) return '';
      return `<h1 class="cat">${escapeHtml(c.label)}</h1>` + notes.map(n => `
        <article><h2>${escapeHtml(n.title || 'Untitled')}</h2>
        <div class="meta">${n.updatedAt?.toDate?.().toLocaleDateString() ?? ''}${n.tags?.length ? ' · #' + n.tags.map(escapeHtml).join(' #') : ''}</div>
        ${detailsHtml(n)}
        <div class="note-content">${this.sanitizer.sanitize(SecurityContext.HTML, n.contentHtml) ?? ''}</div></article>`).join('');
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Farm Notes</title><style>
      body{font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.6}
      h1.cat{border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-top:40px}article{margin:0 0 28px;page-break-inside:avoid}
      .meta{color:#64748b;font-size:12px}.details{background:#f1f5f9;padding:6px 12px;border-radius:6px;font-size:13px;margin:6px 0}
      ${NOTE_CONTENT_CSS}</style></head><body><p class="meta">Exported ${new Date().toLocaleString()}</p>${sections}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `farm-notes-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function searchText(n: Note): string {
  const m = n.medicine || {};
  const k = n.market || {};
  return [n.title, n.contentText, ...(n.tags || []), m.name, m.purpose, m.animal, m.supplier, k.breed, k.animal, k.marketName]
    .filter(Boolean).join(' ').toLowerCase();
}

function detailsHtml(n: Note): string {
  const rows: [string, unknown][] = n.category === 'medicine' && n.medicine
    ? [['Medicine', n.medicine.name], ['Purpose', n.medicine.purpose], ['Animal', n.medicine.animal], ['Dosage', n.medicine.dosage],
       ['Given', n.medicine.route], ['Withdrawal (days)', n.medicine.withdrawalDays], ['Brand/supplier', n.medicine.supplier], ['Cost (₹)', n.medicine.cost]]
    : n.category === 'market' && n.market
      ? [['Breed', n.market.breed], ['Animal', n.market.animal], ['Market', n.market.marketName],
         ['Price (₹)', n.market.pricePerUnit != null ? `${n.market.pricePerUnit} / ${n.market.unit || 'kg'}` : null], ['Observed on', n.market.observedOn]]
      : [];
  const filled = rows.filter(([, v]) => v != null && v !== '');
  return filled.length ? `<div class="details">${filled.map(([l, v]) => `<b>${l}:</b> ${escapeHtml(String(v))}`).join(' &nbsp;·&nbsp; ')}</div>` : '';
}

