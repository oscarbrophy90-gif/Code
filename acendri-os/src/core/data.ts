/**
 * The content an account owns: today's list and its notes.
 *
 * Filed under the account id, so two people sharing a device never see each
 * other's things, and deleting an account takes its content with it.
 */

import { randomId } from './hash.ts';
import { readJSON, remove, writeJSON } from './storage.ts';

export type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  /** Set the moment it is ticked; used for the "done today" count. */
  completedAt: number | null;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
};

type Bundle = { tasks: Task[]; notes: Note[] };

const EMPTY: Bundle = { tasks: [], notes: [] };

function key(userId: string): string {
  return `data.${userId}`;
}

function load(userId: string): Bundle {
  const raw = readJSON<Partial<Bundle>>(key(userId), {});
  return {
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  };
}

function save(userId: string, bundle: Bundle): void {
  writeJSON(key(userId), bundle);
}

/** Called when an account is deleted, so nothing is left behind on the device. */
export function forgetUser(userId: string): void {
  remove(key(userId));
}

// -------------------------------------------------------------------- tasks

export function tasks(userId: string): Task[] {
  return load(userId).tasks;
}

export function addTask(userId: string, title: string): Task | null {
  const clean = title.trim();
  if (!clean) return null;

  const bundle = load(userId);
  const task: Task = {
    id: randomId(8),
    title: clean.slice(0, 140),
    done: false,
    createdAt: Date.now(),
    completedAt: null,
  };
  // Newest first — the thing you just typed should not be below the fold.
  bundle.tasks.unshift(task);
  save(userId, bundle);
  return task;
}

export function toggleTask(userId: string, id: string): void {
  const bundle = load(userId);
  const task = bundle.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? Date.now() : null;
  save(userId, bundle);
}

export function renameTask(userId: string, id: string, title: string): void {
  const clean = title.trim();
  if (!clean) return;
  const bundle = load(userId);
  const task = bundle.tasks.find((t) => t.id === id);
  if (!task) return;
  task.title = clean.slice(0, 140);
  save(userId, bundle);
}

export function removeTask(userId: string, id: string): void {
  const bundle = load(userId);
  bundle.tasks = bundle.tasks.filter((t) => t.id !== id);
  save(userId, bundle);
}

export function clearDoneTasks(userId: string): number {
  const bundle = load(userId);
  const before = bundle.tasks.length;
  bundle.tasks = bundle.tasks.filter((t) => !t.done);
  save(userId, bundle);
  return before - bundle.tasks.length;
}

/** Ticked since midnight — what the home screen counts. */
export function completedToday(userId: string): number {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return load(userId).tasks.filter((t) => t.completedAt !== null && t.completedAt >= midnight.getTime())
    .length;
}

// -------------------------------------------------------------------- notes

/** Pinned first, then most recently touched. */
export function notes(userId: string): Note[] {
  return load(userId).notes.sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );
}

export function note(userId: string, id: string): Note | undefined {
  return load(userId).notes.find((n) => n.id === id);
}

export function createNote(userId: string): Note {
  const bundle = load(userId);
  const now = Date.now();
  const fresh: Note = { id: randomId(8), title: '', body: '', createdAt: now, updatedAt: now, pinned: false };
  bundle.notes.unshift(fresh);
  save(userId, bundle);
  return fresh;
}

export function saveNote(userId: string, id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'pinned'>>): void {
  const bundle = load(userId);
  const found = bundle.notes.find((n) => n.id === id);
  if (!found) return;
  if (patch.title !== undefined) found.title = patch.title.slice(0, 120);
  if (patch.body !== undefined) found.body = patch.body;
  if (patch.pinned !== undefined) found.pinned = patch.pinned;
  found.updatedAt = Date.now();
  save(userId, bundle);
}

export function removeNote(userId: string, id: string): void {
  const bundle = load(userId);
  bundle.notes = bundle.notes.filter((n) => n.id !== id);
  save(userId, bundle);
}

/** An untitled, empty note is a false start, not a note. Called when the editor closes. */
export function dropIfBlank(userId: string, id: string): boolean {
  const found = note(userId, id);
  if (!found || found.title.trim() || found.body.trim()) return false;
  removeNote(userId, id);
  return true;
}

export function searchNotes(userId: string, query: string): Note[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes(userId);
  return notes(userId).filter(
    (n) => n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle),
  );
}

/** The one-line preview under a note's title in the list. */
export function preview(n: Note): string {
  const body = n.body.trim().replace(/\s+/g, ' ');
  if (!body) return 'No extra text';
  return body.length > 90 ? `${body.slice(0, 90)}…` : body;
}
