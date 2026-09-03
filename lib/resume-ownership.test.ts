import { describe, expect, it } from "vitest";
import {
  getResumeOwnerInsert,
  getResumeStoragePath,
  resumeBelongsToOwner,
} from "./resume-ownership";

describe("resume ownership helpers", () => {
  it("creates authenticated user-scoped storage paths", () => {
    expect(
      getResumeStoragePath(
        { kind: "authenticated", userId: "user-123" },
        "resume-456"
      )
    ).toBe("user-123/resume-456/original");
  });

  it("creates temporary anonymous session-scoped storage paths", () => {
    expect(
      getResumeStoragePath(
        { kind: "anonymous", anonymousSessionId: "session-123" },
        "resume-456"
      )
    ).toBe("temporary/session-123/resume-456/original");
  });

  it("stores either authenticated or anonymous ownership", () => {
    expect(getResumeOwnerInsert({ kind: "authenticated", userId: "user-123" })).toEqual({
      user_id: "user-123",
      anonymous_session_id: null,
    });

    expect(
      getResumeOwnerInsert({ kind: "anonymous", anonymousSessionId: "session-123" })
    ).toEqual({
      user_id: null,
      anonymous_session_id: "session-123",
    });
  });

  it("prevents another anonymous session from matching a resume", () => {
    expect(
      resumeBelongsToOwner(
        { user_id: null, anonymous_session_id: "session-a" },
        { kind: "anonymous", anonymousSessionId: "session-b" }
      )
    ).toBe(false);
  });
});
