"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  Clock,
  Loader2,
  LogOut,
  MessagesSquare,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import {
  getInterviewSetupContext,
  startInterviewSession,
  submitAnswerAction,
  abandonInterviewAction,
} from "@/app/actions/mock-interview";
import type {
  InterviewDifficulty,
  InterviewQuestionCount,
  InterviewSession,
  InterviewSetupContext,
  InterviewType,
} from "@/types";
import { DIFFICULTY_OPTIONS, INTERVIEW_QUESTION_COUNTS } from "@/lib/interview/session-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar, EmptyState } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import { MockInterviewReport } from "@/components/mock-interview-report";
import { cn } from "@/lib/utils";

type PanelStage = "loading" | "setup-error" | "setup" | "starting" | "interview" | "completed";

const INTERVIEW_TYPE_OPTIONS: { value: InterviewType; label: string; description: string }[] = [
  { value: "technical", label: "Technical", description: "Skills, tools, and hands-on problem solving" },
  { value: "behavioral", label: "Behavioral", description: "Past experience and how you handled situations" },
  { value: "hr", label: "HR", description: "Fit, motivation, and general screening questions" },
  { value: "mixed", label: "Mixed", description: "A realistic blend of all three" },
];

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MockInterviewPanel() {
  const [stage, setStage] = useState<PanelStage>("loading");
  const [setupContext, setSetupContext] = useState<InterviewSetupContext | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [interviewType, setInterviewType] = useState<InterviewType>("mixed");
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>("intermediate");
  const [questionCount, setQuestionCount] = useState<InterviewQuestionCount>(10);

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);

  // ── Load setup context on mount ─────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await getInterviewSetupContext();
        if (cancelled) return;
        if (response.status === "success") {
          setSetupContext(response.context);
          setStage("setup");
        } else {
          setErrorMessage(response.error);
          setStage("setup-error");
        }
      } catch {
        if (!cancelled) {
          setErrorMessage("An unexpected error occurred while loading the interview setup.");
          setStage("setup-error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Elapsed timer while interviewing ────────
  useEffect(() => {
    if (stage !== "interview" || !session) return;
    const startedAtMs = new Date(session.startedAt).getTime();
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [stage, session]);

  // ── Start interview ─────────────────────────
  const handleStart = useCallback(async () => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    setStage("starting");
    setErrorMessage("");

    try {
      const response = await startInterviewSession({ interviewType, difficulty, questionCount });
      if (response.status === "success") {
        setSession(response.session);
        setJobTitle(response.jobTitle);
        setJobCompany(response.jobCompany);
        setStage("interview");
      } else {
        setErrorMessage(response.error);
        setStage("setup");
      }
    } catch {
      setErrorMessage("An unexpected error occurred while starting the interview.");
      setStage("setup");
    } finally {
      startInFlightRef.current = false;
    }
  }, [interviewType, difficulty, questionCount]);

  // ── Submit an answer ────────────────────────
  const handleSubmitAnswer = useCallback(async () => {
    if (submitInFlightRef.current || !session) return;
    const trimmed = answerText.trim();
    if (!trimmed) return;

    const current = session.questions[session.questions.length - 1];
    submitInFlightRef.current = true;
    setSubmitting(true);
    setErrorMessage("");

    try {
      const response = await submitAnswerAction(session.id, current.number, trimmed);
      if (response.status === "success") {
        setSession(response.session);
        setAnswerText("");
        if (response.session.status === "completed") {
          setStage("completed");
        }
      } else {
        setErrorMessage(response.error);
      }
    } catch {
      setErrorMessage("An unexpected error occurred while submitting your answer.");
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }, [session, answerText]);

  // ── Exit interview ──────────────────────────
  const handleExit = useCallback(async () => {
    setExitConfirm(false);
    if (!session) return;
    try {
      await abandonInterviewAction(session.id);
    } catch {
      // Best-effort — the user is leaving either way.
    }
    setSession(null);
    setAnswerText("");
    setStage("setup");
  }, [session]);

  const handleRetake = useCallback(() => {
    setSession(null);
    setAnswerText("");
    setErrorMessage("");
    setStage("setup");
  }, []);

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  if (stage === "loading") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-8 sm:px-8 sm:py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="mt-3 text-xs text-muted-foreground">Loading your interview setup...</p>
      </div>
    );
  }

  if (stage === "setup-error") {
    return (
      <EmptyState
        icon={Target}
        title="Run a job match first"
        description={errorMessage || "The Mock Interviewer is personalized from your resume, target role, and skill gaps."}
        action={{ label: "Open Job Matcher", href: "/job-matcher" }}
        className="py-10"
      />
    );
  }

  if (stage === "completed" && session) {
    return <MockInterviewReport session={session} jobTitle={jobTitle} jobCompany={jobCompany} onRetake={handleRetake} />;
  }

  if ((stage === "setup" || stage === "starting") && setupContext) {
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-1 py-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Briefcase className="size-4 text-primary" />
              {setupContext.jobTitle}
              {setupContext.jobCompany && <span className="text-muted-foreground font-normal"> · {setupContext.jobCompany}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              {Math.round(setupContext.matchScore)}% match · practicing this interview will not change your saved match score
            </p>
          </CardContent>
        </Card>

        {/* Interview type */}
        <div>
          <p className="mb-2 text-xs font-semibold text-foreground">Interview Type</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {INTERVIEW_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setInterviewType(opt.value)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-all duration-200 active:scale-[0.98]",
                  interviewType === opt.value
                    ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                    : "border-border hover:bg-muted/60"
                )}
              >
                <p className="text-xs font-semibold text-foreground">{opt.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <p className="mb-2 text-xs font-semibold text-foreground">Difficulty</p>
          <div className="flex gap-2">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDifficulty(opt.value)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-[0.98]",
                  difficulty === opt.value
                    ? "border-primary/40 bg-primary/5 text-primary shadow-sm ring-1 ring-primary/20"
                    : "border-border text-muted-foreground hover:bg-muted/60"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Question count */}
        <div>
          <p className="mb-2 text-xs font-semibold text-foreground">Interview Length</p>
          <div className="flex gap-2">
            {INTERVIEW_QUESTION_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setQuestionCount(count)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-[0.98]",
                  questionCount === count
                    ? "border-primary/40 bg-primary/5 text-primary shadow-sm ring-1 ring-primary/20"
                    : "border-border text-muted-foreground hover:bg-muted/60"
                )}
              >
                {count} questions
              </button>
            ))}
          </div>
        </div>

        {/* Summary preview */}
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-foreground">Summary</p>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Target Role</dt>
              <dd className="text-right font-medium text-foreground">{setupContext.jobTitle}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Interview Type</dt>
              <dd className="text-right font-medium capitalize text-foreground">{interviewType}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Difficulty</dt>
              <dd className="text-right font-medium capitalize text-foreground">{difficulty}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Questions</dt>
              <dd className="text-right font-medium text-foreground">{questionCount}</dd>
            </div>
          </dl>
          {setupContext.suggestedFocusAreas.length > 0 && (
            <div className="mt-2.5 border-t border-primary/10 pt-2.5">
              <p className="mb-1.5 text-muted-foreground">Focus Areas</p>
              <div className="flex flex-wrap gap-1.5">
                {setupContext.suggestedFocusAreas.map((area) => (
                  <Badge key={area} variant="secondary" className="text-[10px]">
                    {area}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground">{errorMessage}</p>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={stage === "starting"}
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          {stage === "starting" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Preparing your interviewer...
            </>
          ) : (
            <>
              <MessagesSquare className="size-4" />
              Start Interview
            </>
          )}
        </button>
      </div>
    );
  }

  // ── Interview stage ────────────────────────
  if (stage === "interview" && session) {
    const mainAsked = session.questions.filter((q) => !q.isFollowUp).length;
    const answeredMain = session.questions.filter((q) => !q.isFollowUp && q.answer !== undefined).length;
    const percentage = Math.round((answeredMain / session.questionCount) * 100);
    const current = session.questions[session.questions.length - 1];
    const history = session.questions.slice(0, -1).filter((q) => q.answer !== undefined);

    return (
      <div className="space-y-4">
        {/* Progress header */}
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                Question {Math.min(mainAsked, session.questionCount)} of {session.questionCount}
              </span>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatElapsed(elapsedSeconds)}
                </span>
                {!exitConfirm ? (
                  <button
                    onClick={() => setExitConfirm(true)}
                    className="flex items-center gap-1 text-muted-foreground hover:text-destructive"
                  >
                    <LogOut className="size-3" />
                    Exit
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5">
                    End interview?
                    <button onClick={handleExit} className="font-medium text-destructive hover:underline">
                      Yes
                    </button>
                    <button onClick={() => setExitConfirm(false)} className="text-muted-foreground hover:underline">
                      No
                    </button>
                  </span>
                )}
              </span>
            </div>
            <ProgressBar value={percentage} size="sm" />
          </CardContent>
        </Card>

        {/* Conversation history */}
        {history.length > 0 && (
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
            {history.map((q) => (
              <div key={q.number} className="animate-in fade-in slide-in-from-bottom-1 duration-300 space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MessagesSquare className="size-3 text-primary" />
                  </div>
                  <div className="rounded-lg rounded-tl-none bg-card px-3 py-2 text-xs text-foreground shadow-sm ring-1 ring-border max-w-[85%]">
                    {q.question}
                  </div>
                </div>
                <div className="flex items-start justify-end gap-2">
                  <div className="rounded-lg rounded-tr-none bg-primary/10 px-3 py-2 text-xs text-foreground max-w-[85%]">
                    {q.answer}
                  </div>
                </div>
              </div>
            ))}
            {submitting && (
              <div className="flex items-start gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <MessagesSquare className="size-3 text-primary" />
                </div>
                <div className="flex items-center gap-1 rounded-lg rounded-tl-none bg-card px-3 py-2.5 shadow-sm ring-1 ring-border">
                  <span className="size-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-primary/50" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current question */}
        <Card
          key={current.number}
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 border-primary/30 bg-primary/[0.02]"
        >
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] capitalize">
                {current.category.replace("_", " ")}
              </Badge>
              {current.isFollowUp && (
                <Badge variant="outline" className="text-[10px]">
                  Follow-up
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium leading-relaxed text-foreground">{current.question}</p>
            <Textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Type your answer..."
              rows={5}
              disabled={submitting}
              className="text-sm"
            />
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                {errorMessage}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Your progress is saved after every answer.</p>
              <button
                onClick={handleSubmitAnswer}
                disabled={submitting || !answerText.trim()}
                className={cn(buttonVariants({ size: "sm" }))}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Send className="size-3.5" />
                    Submit Answer
                  </>
                )}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <EmptyState
      icon={Sparkles}
      title="Something went wrong"
      description="Please refresh the page and try again."
      className="py-10"
    />
  );
}
