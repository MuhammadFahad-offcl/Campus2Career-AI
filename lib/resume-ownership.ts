export type ResumeOwner =
  | { kind: "authenticated"; userId: string; anonymousSessionId?: null }
  | { kind: "anonymous"; userId?: null; anonymousSessionId: string };

export function getResumeStoragePath(owner: ResumeOwner, resumeId: string): string {
  if (owner.kind === "authenticated") {
    return `${owner.userId}/${resumeId}/original`;
  }

  return `temporary/${owner.anonymousSessionId}/${resumeId}/original`;
}

export function getResumeOwnerInsert(owner: ResumeOwner) {
  return {
    user_id: owner.kind === "authenticated" ? owner.userId : null,
    anonymous_session_id:
      owner.kind === "anonymous" ? owner.anonymousSessionId : null,
  };
}

export function resumeBelongsToOwner(
  resume: { user_id?: string | null; anonymous_session_id?: string | null },
  owner: ResumeOwner
): boolean {
  if (owner.kind === "authenticated") {
    return resume.user_id === owner.userId;
  }

  return resume.anonymous_session_id === owner.anonymousSessionId;
}
