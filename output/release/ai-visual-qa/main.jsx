import React from 'react';
import { createRoot } from 'react-dom/client';
import JournalAiAnalysis from '../../../PATHWAY-web/src/components/JournalAiAnalysis.js';
import AttendanceAiExplanation from '../../../PATHWAY-web/src/components/AttendanceAiExplanation.js';
import DocumentAiAssistance from '../../../PATHWAY-web/src/components/DocumentAiAssistance.js';
import './qa.css';
function App() { return <main><header><small>PATHWAY · LOCAL TEST ONLY</small><h1>AI review panels</h1><p>Real components, fictional content, mocked requests. No sign-in, backend access or paid AI calls.</p><label><input id="qa-failure" type="checkbox" /> Simulate unavailable AI</label></header><div className="qa-grid"><section><h2>Journal review</h2><p>I tested the form and documented the result.</p><JournalAiAnalysis studentId="fictional" entryId="fixture" sourceText="I tested the form and documented the result." /></section><section><h2>Attendance metrics</h2><p>Risk: Unavailable · Attendance rate: Unavailable</p><AttendanceAiExplanation sectionId="fictional" studentId="fixture" /></section><section><h2>Document excerpt</h2><DocumentAiAssistance studentId="fictional" requirementId="certificate" text="TEST ONLY\nSupervisor: blank" /></section><section><h2>DTR comparison</h2><p>Manual transcription and deterministic comparison remain authoritative.</p><DocumentAiAssistance studentId="fictional" requirementId="dtr" text="TEST ONLY\nSupervisor: blank" form={{ year: 2026, month: 10, copies: [[{ day: 1 }]] }} /></section></div></main>; }
createRoot(document.getElementById('root')).render(<App />);
