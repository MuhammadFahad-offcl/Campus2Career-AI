import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Campus2Career AI — AI Career Intelligence";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0b0b12",
          backgroundImage:
            "radial-gradient(circle at 25% 20%, rgba(99,102,241,0.35), transparent 55%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.28), transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              borderRadius: 20,
              background: "linear-gradient(135deg, #6366f1, #a855f7)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                background: "#fff",
                clipPath:
                  "polygon(55% 0%, 0% 60%, 42% 60%, 40% 100%, 100% 38%, 58% 38%)",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: -1,
            }}
          >
            Campus2Career AI
          </div>
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#c7c7d9",
            maxWidth: 880,
            textAlign: "center",
          }}
        >
          AI-powered career intelligence for students &amp; early-career
          professionals
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
