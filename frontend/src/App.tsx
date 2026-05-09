import { useState, useCallback } from "react";
import { runWorkflow, type PhaseResult } from "./api/ai";
import "./App.css";

const SAMPLE_INPUT = JSON.stringify(
  {
    selfAnalysisInput: {
      careerHistory: [
        {
          year: 2020,
          role: "Software Engineer",
          company: "TechCorp",
          industry: "IT",
          responsibilities: ["Backend development", "API design"],
          achievements: ["Reduced API latency by 40%"],
        },
      ],
      skills: {
        technical: [
          { name: "TypeScript", category: "language", level: 4, yearsOfExperience: 5 },
          { name: "React", category: "framework", level: 3, yearsOfExperience: 3 },
        ],
        business: [],
        soft: [{ name: "Problem solving", category: "problem_solving", level: 4 }],
      },
      achievements: [
        {
          type: "project",
          description: "Built microservices platform",
          metric: "users",
          value: 10000,
          unit: "users",
          period: "2023",
        },
      ],
      network: {
        industryContacts: 20,
        influentialConnections: 3,
        communities: [{ name: "Tech Meetup", role: "speaker" as const, memberCount: 200 }],
        socialMedia: [],
      },
      values: {
        priorities: ["Innovation", "Autonomy"],
        socialCauses: [],
        threeYearGoal: "Launch AI SaaS startup",
        fiveYearVision: "Scale to 1000 customers",
        motivations: ["Building products", "Solving real problems"],
      },
    },
    targetMarkets: [
      { name: "Japan SME", description: "Small-to-medium enterprises in Japan", priority: 1 as const },
    ],
    initialCompetitors: ["CompetitorA"],
  },
  null,
  2,
);

type PhaseStatus = "pending" | "running" | "complete";
type View = "input" | "progress" | "results";

function App(): JSX.Element {
  const [view, setView] = useState<View>("input");
  const [jsonInput, setJsonInput] = useState(SAMPLE_INPUT);
  const [parseError, setParseError] = useState<string | null>(null);
  const [phaseStatuses, setPhaseStatuses] = useState<PhaseStatus[]>(["pending", "pending", "pending", "pending"]);
  const [phaseResults, setPhaseResults] = useState<Record<number, unknown>>({});
  const [workflowResult, setWorkflowResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const handleRun = useCallback(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonInput);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }
    setParseError(null);
    setError(null);
    setPhaseStatuses(["running", "pending", "pending", "pending"]);
    setPhaseResults({});
    setWorkflowResult(null);
    setView("progress");

    const phaseNames = ["SelfAnalysis", "MarketResearch", "Persona", "ProductConcept"];

    runWorkflow(parsed, {
      onPhaseComplete(result: PhaseResult) {
        setPhaseStatuses((prev) => {
          const next = [...prev];
          next[result.phase - 1] = "complete";
          if (result.phase < 4) next[result.phase] = "running";
          return next;
        });
        setPhaseResults((prev) => ({ ...prev, [result.phase - 1]: result.output }));
      },
      onWorkflowComplete(result) {
        setWorkflowResult(result);
        setView("results");
      },
      onError(msg) {
        setError(msg);
        setView("progress");
      },
    });
  }, [jsonInput]);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Startup Agent Chain</h1>
        <p className="app__subtitle">4-phase AI business planning workflow</p>
      </header>

      <main className="app__main">
        {view === "input" && (
          <section className="card">
            <h2 className="card__title">Workflow Input (JSON)</h2>
            <textarea
              className="card__textarea"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={20}
              spellCheck={false}
            />
            {parseError && <p className="card__error">JSON parse error: {parseError}</p>}
            <button type="button" className="card__action" onClick={handleRun}>
              Run Workflow
            </button>
          </section>
        )}

        {view === "progress" && (
          <section className="card">
            <h2 className="card__title">Executing Workflow</h2>
            <div className="phases">
              {["Self Analysis", "Market Research", "Persona", "Product Concept"].map((name, i) => (
                <div key={i} className={`phase phase--${phaseStatuses[i]}`}>
                  <span className="phase__indicator">
                    {phaseStatuses[i] === "complete" ? "done" : phaseStatuses[i] === "running" ? "..." : "—"}
                  </span>
                  <span className="phase__name">Phase {i + 1}: {name}</span>
                </div>
              ))}
            </div>
            {error && (
              <div className="card__error" role="alert">
                <p>Error: {error}</p>
              </div>
            )}
          </section>
        )}

        {view === "results" && (
          <section className="card">
            <h2 className="card__title">Results</h2>
            <div className="tabs">
              {["Self Analysis", "Market Research", "Persona", "Product Concept"].map((name, i) => (
                <button
                  key={i}
                  type="button"
                  className={`tab ${activeTab === i ? "tab--active" : ""}`}
                  onClick={() => setActiveTab(i)}
                >
                  {name}
                </button>
              ))}
            </div>
            <pre className="card__result">
              {JSON.stringify(phaseResults[activeTab] ?? workflowResult, null, 2)}
            </pre>
            <button type="button" className="card__action" onClick={() => { setView("input"); setActiveTab(0); }}>
              New Workflow
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
