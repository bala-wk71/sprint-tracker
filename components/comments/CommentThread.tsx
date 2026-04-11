"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  createComment,
  updateComment,
  deleteComment,
  type CommentRow,
} from "./actions";

type TargetType = "daily_log" | "sprint";

type Props = {
  targetType: TargetType;
  targetId: string;
  ownerId: string;
  currentUserId: string;
  initialComments: CommentRow[];
  /** Paths to revalidate on any mutation (so server-rendered parents refresh). */
  revalidatePaths?: string[];
};

type Node = CommentRow & { replies: CommentRow[] };

function buildTree(rows: CommentRow[]): Node[] {
  // One-level threading: a top-level comment is parent_id === null; replies
  // reference the top-level id. Any deeper nesting is flattened under the
  // nearest top-level ancestor.
  const byId = new Map<string, CommentRow>();
  for (const r of rows) byId.set(r.id, r);

  const topLevel: Node[] = [];
  const indexOfTop = new Map<string, number>();

  for (const r of rows) {
    if (!r.parent_id) {
      indexOfTop.set(r.id, topLevel.length);
      topLevel.push({ ...r, replies: [] });
    }
  }

  for (const r of rows) {
    if (!r.parent_id) continue;
    let parentId: string | null = r.parent_id;
    // Walk up until we find a top-level ancestor.
    while (parentId && !indexOfTop.has(parentId)) {
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
    if (parentId && indexOfTop.has(parentId)) {
      topLevel[indexOfTop.get(parentId)!].replies.push(r);
    }
  }

  return topLevel;
}

function authorName(c: CommentRow): string {
  return c.author?.full_name || c.author?.email || "Unknown";
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function CommentThread({
  targetType,
  targetId,
  ownerId,
  currentUserId,
  initialComments,
  revalidatePaths,
}: Props) {
  const router = useRouter();
  const tree = useMemo(() => buildTree(initialComments), [initialComments]);

  return (
    <div className="space-y-4">
      {tree.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No comments yet. Start the thread below.
        </p>
      ) : (
        <ul className="space-y-4">
          {tree.map((node) => (
            <li key={node.id}>
              <CommentNode
                node={node}
                targetType={targetType}
                targetId={targetId}
                ownerId={ownerId}
                currentUserId={currentUserId}
                revalidatePaths={revalidatePaths}
                onChanged={() => router.refresh()}
              />
            </li>
          ))}
        </ul>
      )}

      <NewCommentForm
        targetType={targetType}
        targetId={targetId}
        ownerId={ownerId}
        parentId={null}
        placeholder="Add a comment…"
        revalidatePaths={revalidatePaths}
        onSubmitted={() => router.refresh()}
      />
    </div>
  );
}

function CommentNode({
  node,
  targetType,
  targetId,
  ownerId,
  currentUserId,
  revalidatePaths,
  onChanged,
}: {
  node: Node;
  targetType: TargetType;
  targetId: string;
  ownerId: string;
  currentUserId: string;
  revalidatePaths?: string[];
  onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <CommentBody
        comment={node}
        currentUserId={currentUserId}
        revalidatePaths={revalidatePaths}
        onChanged={onChanged}
      />

      {node.replies.length > 0 && (
        <ul className="mt-3 space-y-3 border-l-2 border-border pl-4">
          {node.replies.map((reply) => (
            <li key={reply.id}>
              <CommentBody
                comment={reply}
                currentUserId={currentUserId}
                revalidatePaths={revalidatePaths}
                onChanged={onChanged}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        {replying ? (
          <NewCommentForm
            targetType={targetType}
            targetId={targetId}
            ownerId={ownerId}
            parentId={node.id}
            placeholder={`Reply to ${authorName(node)}…`}
            revalidatePaths={revalidatePaths}
            onSubmitted={() => {
              setReplying(false);
              onChanged();
            }}
            onCancel={() => setReplying(false)}
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Reply
          </button>
        )}
      </div>
    </div>
  );
}

function CommentBody({
  comment,
  currentUserId,
  revalidatePaths,
  onChanged,
}: {
  comment: CommentRow;
  currentUserId: string;
  revalidatePaths?: string[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isMine = comment.author_id === currentUserId;
  const name = authorName(comment);
  const when = formatDistanceToNow(new Date(comment.created_at), {
    addSuffix: true,
  });
  const edited =
    new Date(comment.updated_at).getTime() -
      new Date(comment.created_at).getTime() >
    1500;

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateComment({
        id: comment.id,
        body: draft,
        revalidate_paths: revalidatePaths,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      onChanged();
    });
  };

  const remove = () => {
    if (!confirm("Delete this comment?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteComment({
        id: comment.id,
        revalidate_paths: revalidatePaths,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged();
    });
  };

  return (
    <div className="flex gap-3">
      {comment.author?.avatar_url ? (
        <Image
          src={comment.author.avatar_url}
          alt={name}
          width={32}
          height={32}
          className="h-8 w-8 flex-shrink-0 rounded-full"
        />
      ) : (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {initialsOf(name) || "?"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="text-xs text-muted-foreground">{when}</span>
          {edited && (
            <span className="text-xs italic text-muted-foreground">edited</span>
          )}
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={pending || draft.trim().length === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                  setError(null);
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {comment.body}
          </p>
        )}

        {error && (
          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {error}
          </p>
        )}

        {isMine && !editing && (
          <div className="mt-2 flex gap-3 text-xs">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewCommentForm({
  targetType,
  targetId,
  ownerId,
  parentId,
  placeholder,
  revalidatePaths,
  onSubmitted,
  onCancel,
  autoFocus,
}: {
  targetType: TargetType;
  targetId: string;
  ownerId: string;
  parentId: string | null;
  placeholder: string;
  revalidatePaths?: string[];
  onSubmitted: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (body.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await createComment({
        target_type: targetType,
        target_id: targetId,
        owner_id: ownerId,
        parent_id: parentId,
        body,
        revalidate_paths: revalidatePaths,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      onSubmitted();
    });
  };

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || body.trim().length === 0}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Posting…" : parentId ? "Reply" : "Comment"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
