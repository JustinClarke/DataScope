import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings';
import { deleteShare } from '../../services/export';

/**
 * "Links I created" (§12.3) — the local record of share links this browser
 * saved, with a "delete now" control on each. Deleting purges the object
 * server-side (the link 404s afterward) and drops the local entry; a delete
 * that fails leaves the entry in place rather than stranding an unreachable
 * object with no local reference left to retry from.
 */
export function ShareLinksList() {
  const shareLinks = useSettingsStore((state) => state.shareLinks);
  const removeShareLink = useSettingsStore((state) => state.removeShareLink);
  const [deletingToken, setDeletingToken] = useState<string | null>(null);
  const [failedToken, setFailedToken] = useState<string | null>(null);

  if (shareLinks.length === 0) return null;

  async function handleDelete(token: string, deleteToken: string) {
    setDeletingToken(token);
    setFailedToken(null);
    try {
      const result = await deleteShare(token, deleteToken);
      if (result.ok) {
        removeShareLink(token);
      } else {
        setFailedToken(token);
      }
    } finally {
      setDeletingToken(null);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-(--color-fg-muted)">Your share links</h2>
      <ul className="flex flex-col gap-2">
        {shareLinks.map((link) => {
          const expiresAt = new Date(new Date(link.createdAt).getTime() + link.ttlSeconds * 1000);
          return (
            <li
              key={link.token}
              className="flex items-center justify-between rounded-lg border border-(--color-border) px-4 py-2"
            >
              <div>
                <span className="font-medium text-(--color-fg)">{link.label}</span>
                <span className="ml-2 text-sm text-(--color-fg-muted)">
                  {link.kind === 'full-dataset' ? 'full dataset' : 'structure only'} · expires{' '}
                  {expiresAt.toLocaleDateString()}
                </span>
                {failedToken === link.token && (
                  <span className="ml-2 text-sm text-(--color-error)">couldn't delete — try again</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(link.token, link.deleteToken)}
                disabled={deletingToken === link.token}
                aria-label={`Delete share link for ${link.label}`}
                className="rounded p-1 text-(--color-fg-muted) transition-colors hover:bg-(--color-border) hover:text-(--color-fg) disabled:opacity-50"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
