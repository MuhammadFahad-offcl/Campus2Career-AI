import { candidateProfileSchema } from "@/schemas";

export function shouldReuseCandidateProfile(input: {
  candidateProfile: unknown;
  analysisStatus: string | null;
  force?: boolean;
}): boolean {
  if (input.force) return false;
  if (input.analysisStatus !== "completed") return false;
  if (!input.candidateProfile) return false;

  return candidateProfileSchema.safeParse(input.candidateProfile).success;
}
