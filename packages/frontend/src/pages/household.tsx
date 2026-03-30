import { useEffect, useState } from "react";
import { household } from "../lib/api";
import type { HouseholdData } from "../lib/api";
import { Button, Input } from "../components/ui";

type Tab = "shopping" | "reminders" | "notes";

export function HouseholdPage() {
  const [tab, setTab] = useState<Tab>("shopping");
  const [data, setData] = useState<HouseholdData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shopping
  const [newItem, setNewItem] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  // Reminders
  const [reminderText, setReminderText] = useState("");
  const [reminderDue, setReminderDue] = useState("");
  const [addingReminder, setAddingReminder] = useState(false);

  // Notes
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);

  async function load() {
    try {
      const d = await household.get();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAddShopping(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    setAddingItem(true);
    try {
      const d = await household.addShopping(newItem.trim());
      setData(d);
      setNewItem("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddingItem(false);
    }
  }

  async function handleRemoveShopping(item: string) {
    try {
      const d = await household.removeShopping(item);
      setData(d);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleAddReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!reminderText.trim() || !reminderDue) return;
    setAddingReminder(true);
    try {
      const d = await household.addReminder(reminderText.trim(), reminderDue);
      setData(d);
      setReminderText("");
      setReminderDue("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddingReminder(false);
    }
  }

  async function handleRemoveReminder(index: number) {
    try {
      const d = await household.removeReminder(index);
      setData(d);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteTitle.trim() || !noteBody.trim()) return;
    setAddingNote(true);
    try {
      const d = await household.addNote(noteTitle.trim(), noteBody.trim());
      setData(d);
      setNoteTitle("");
      setNoteBody("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddingNote(false);
    }
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? "bg-[#F4F3EE] text-[#2D2B28]"
        : "text-[#6F6B66] hover:text-[#2D2B28] hover:bg-[#F4F3EE]"
    }`;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2D2B28]">Household</h1>
          <p className="text-sm text-[#6F6B66] mt-1">
            Shared space for {data?.flatmates?.join(", ") || "your household"}
          </p>
        </div>
        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-[#E8F5E9] text-[#2E7D32]">
          Free
        </span>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[#FFEBEE] text-[#C62828] text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#E5E1DB] pb-0">
        <button className={tabClass("shopping")} onClick={() => setTab("shopping")}>
          Shopping
        </button>
        <button className={tabClass("reminders")} onClick={() => setTab("reminders")}>
          Reminders
        </button>
        <button className={tabClass("notes")} onClick={() => setTab("notes")}>
          Notes
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-[#E5E1DB] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Shopping List */}
          {tab === "shopping" && (
            <div className="space-y-4">
              <form onSubmit={handleAddShopping} className="flex gap-2">
                <Input
                  placeholder="Add item…"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={addingItem || !newItem.trim()}>
                  Add
                </Button>
              </form>

              {data?.shopping_list.length === 0 ? (
                <p className="text-sm text-[#6F6B66] text-center py-8">
                  Nothing on the list yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data?.shopping_list.map((entry, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-[#E5E1DB]"
                    >
                      <div>
                        <span className="text-sm font-medium text-[#2D2B28]">
                          {entry.item}
                        </span>
                        <span className="text-xs text-[#B1ADA1] ml-2">
                          {entry.added_by}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveShopping(entry.item)}
                        className="text-[#B1ADA1] hover:text-[#C62828] transition-colors text-lg leading-none"
                        title="Remove"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Reminders */}
          {tab === "reminders" && (
            <div className="space-y-4">
              <form onSubmit={handleAddReminder} className="space-y-2">
                <Input
                  placeholder="Reminder text…"
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                />
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={reminderDue}
                    onChange={(e) => setReminderDue(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#E5E1DB] bg-white text-[#2D2B28] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <Button
                    type="submit"
                    disabled={addingReminder || !reminderText.trim() || !reminderDue}
                  >
                    Add
                  </Button>
                </div>
              </form>

              {data?.reminders.length === 0 ? (
                <p className="text-sm text-[#6F6B66] text-center py-8">
                  No reminders set.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data?.reminders.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-[#E5E1DB]"
                    >
                      <div>
                        <span className="text-sm font-medium text-[#2D2B28]">
                          {r.text}
                        </span>
                        <div className="text-xs text-[#6F6B66] mt-0.5">
                          {new Date(r.due).toLocaleString()} · {r.added_by}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveReminder(i)}
                        className="text-[#B1ADA1] hover:text-[#C62828] transition-colors text-lg leading-none"
                        title="Remove"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Notes */}
          {tab === "notes" && (
            <div className="space-y-4">
              <form onSubmit={handleAddNote} className="space-y-2">
                <Input
                  placeholder="Title…"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                />
                <textarea
                  placeholder="Note body…"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E5E1DB] bg-white text-[#2D2B28] placeholder-[#B1ADA1] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
                />
                <Button
                  type="submit"
                  disabled={addingNote || !noteTitle.trim() || !noteBody.trim()}
                >
                  Save note
                </Button>
              </form>

              {data?.notes.length === 0 ? (
                <p className="text-sm text-[#6F6B66] text-center py-8">
                  No notes yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data?.notes.map((note, i) => (
                    <li key={i} className="bg-white rounded-lg border border-[#E5E1DB] overflow-hidden">
                      <button
                        onClick={() => setExpandedNote(expandedNote === i ? null : i)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <span className="text-sm font-medium text-[#2D2B28]">
                          {note.title}
                        </span>
                        <span className="text-[#B1ADA1] text-xs">{note.added_by}</span>
                      </button>
                      {expandedNote === i && (
                        <div className="px-4 pb-3 text-sm text-[#6F6B66] whitespace-pre-wrap border-t border-[#E5E1DB] pt-3">
                          {note.body}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
