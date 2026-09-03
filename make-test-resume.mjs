// Temporary E2E fixture generator — creates a realistic fresh-graduate resume PDF.
// Candidate: Python + React student, no professional experience, NO Docker/AWS/
// FastAPI/PostgreSQL/TypeScript/CI-CD (used to verify hallucination protection).
import { writeFileSync } from "node:fs";

const lines = [
  "Nadia Rahman",
  "Computer Science Student",
  "Email: nadia.rahman@student.edu | Phone: +880 1712 345678 | Location: Dhaka, Bangladesh",
  "",
  "EDUCATION",
  "BSc in Computer Science and Engineering, University of Dhaka, Dhaka, Bangladesh",
  "Expected graduation: May 2027 | GPA: 3.78 / 4.00",
  "Relevant coursework: Data Structures and Algorithms, Object-Oriented Programming,",
  "Database Systems, Web Development, Linear Algebra",
  "",
  "TECHNICAL SKILLS",
  "Programming languages: Python, JavaScript, C",
  "Libraries and frameworks: React, pandas, NumPy, matplotlib",
  "Tools: Git, GitHub, VS Code, Jupyter Notebook, Figma",
  "",
  "PROJECTS",
  "Student Marketplace - React E-Commerce Frontend (January 2026 - March 2026)",
  "- Built a responsive e-commerce front-end with React featuring product listings,",
  "  a shopping cart, and a checkout flow.",
  "- Implemented component state with React hooks and client-side routing for five pages.",
  "- Practiced responsive CSS with a mobile-first layout.",
  "",
  "Sales Data Analysis Dashboard (September 2025 - December 2025)",
  "- Analyzed a dataset of 10,000 sales records using Python and pandas.",
  "- Cleaned missing values and aggregated monthly revenue trends.",
  "- Visualized key findings with matplotlib and presented results at a course showcase.",
  "",
  "Personal Portfolio Website (August 2025)",
  "- Designed and built a personal portfolio with React and plain CSS.",
  "- Managed versions with Git and hosted the repository on GitHub.",
  "",
  "ACHIEVEMENTS",
  "Dean's List, Fall 2025 semester",
  "Participant, University Hackathon 2025 (top 10 of 60 teams)",
  "",
  "LANGUAGES",
  "English (fluent), Bengali (native)",
];

let content = "BT\n/F1 10 Tf\n13 TL\n72 740 Td\n";
for (const line of lines) {
  const escaped = line
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
  content += `(${escaped}) Tj\nT*\n`;
}
content += "ET\n";

const objects = [
  "<</Type/Catalog/Pages 2 0 R>>",
  "<</Type/Pages/Kids[3 0 R]/Count 1>>",
  "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
  null,
  "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
];

let pdf = "%PDF-1.4\n";
const offsets = [];
for (let i = 0; i < objects.length; i++) {
  offsets.push(pdf.length);
  if (i === 3) {
    pdf += `4 0 obj<</Length ${Buffer.byteLength(content)}>>\nstream\n${content}endstream\nendobj\n`;
  } else {
    pdf += `${i + 1} 0 obj${objects[i]}endobj\n`;
  }
}

const xrefStart = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (const off of offsets) {
  pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer<</Root 1 0 R/Size ${objects.length + 1}>>\nstartxref\n${xrefStart}\n%%EOF`;

writeFileSync(new URL("./e2e-nadia-rahman-resume.pdf", import.meta.url), pdf, "utf-8");
console.log("Wrote e2e-nadia-rahman-resume.pdf", Buffer.byteLength(pdf), "bytes");
