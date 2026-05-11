import { useState, useCallback, useRef, useEffect } from "react";
import { runWorkflow, type StepResult } from "./api/ai";
import "./App.css";

const SAMPLE_INPUT = JSON.stringify(
  {
    selfAnalysisInput: {
      careerHistory: [
        {
          year: 2019,
          role: "Backend Engineer",
          company: "StartupA",
          industry: "SaaS",
          responsibilities: ["API development", "Database design"],
          achievements: ["Built billing system from scratch"],
        },
        {
          year: 2022,
          role: "Senior Backend Engineer",
          company: "TechCorp",
          industry: "AI/ML",
          responsibilities: ["ML pipeline development", "Infrastructure"],
          achievements: ["Reduced inference cost by 60%"],
        },
      ],
      skills: {
        technical: [
          { name: "TypeScript", category: "language", level: 5, yearsOfExperience: 6 },
          { name: "React", category: "framework", level: 3, yearsOfExperience: 3 },
          { name: "PostgreSQL", category: "tool", level: 4, yearsOfExperience: 4 },
          { name: "Docker", category: "infrastructure", level: 4, yearsOfExperience: 4 },
          { name: "AWS", category: "infrastructure", level: 4, yearsOfExperience: 5 },
        ],
        business: [],
        soft: [{ name: "Problem solving", category: "problem_solving", level: 4 }],
      },
      achievements: [
        {
          type: "project",
          description: "Built microservices platform serving 10K users",
          metric: "users",
          value: 10000,
          unit: "users",
          period: "2023",
        },
      ],
      network: {
        industryContacts: 15,
        influentialConnections: 2,
        communities: [{ name: "Tech Meetup", role: "speaker" as const, memberCount: 200 }],
        socialMedia: [],
      },
      values: {
        priorities: ["Innovation", "Autonomy"],
        socialCauses: [],
        threeYearGoal: "Launch developer-focused AI SaaS",
        fiveYearVision: "Scale to 1000 paying users",
        motivations: ["Building products", "Solving real problems"],
      },
      personalProjects: [
        {
          name: "CLI Tool",
          description: "A developer CLI tool for API scaffolding",
          technologies: ["TypeScript", "Node.js"],
          stars: 200,
          status: "active" as const,
          users: 50,
        },
        {
          name: "Mini SaaS",
          description: "Small project management tool for solo devs",
          technologies: ["TypeScript", "React", "PostgreSQL"],
          status: "completed" as const,
          users: 50,
        },
      ],
      techStackDetail: {
        primaryLanguages: ["TypeScript"],
        frameworks: ["React", "Express", "Next.js"],
        toolsAndPlatforms: ["VS Code", "Git", "GitHub Actions"],
        infrastructure: ["AWS", "Docker", "Terraform"],
        preferredStack: "TypeScript full-stack",
        yearsBuilding: 6,
      },
      productBuilderProfile: {
        productsBuilt: ["CLI Tool", "Mini SaaS"],
        ideasExplored: ["AI-powered code review", "Developer productivity tool"],
        preferredDomain: ["dev tools", "AI SaaS"],
        buildVsBuyPreference: "build" as const,
        soloVsTeam: "small-team" as const,
      },
    },
    targetMarkets: [
      { name: "Japan Dev Tools", description: "Japanese developers building SaaS products", priority: 1 as const },
    ],
    initialCompetitors: ["CompetitorA"],
  },
  null,
  2,
);

type PhaseStatus = "pending" | "running" | "complete";
type View = "input" | "progress" | "results";

const AGENTS = [
  { name: "Skill Analysis", icon: "\u{1F9E0}", iconClass: "analysis", desc: "Analyze skills & career" },
  { name: "Market Research", icon: "\u{1F50D}", iconClass: "research", desc: "Research market trends" },
  { name: "Idea Proposal", icon: "\u{1F4A1}", iconClass: "proposal", desc: "Generate business ideas" },
];

function CircularProgress({ value }: { value: number }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="progress-ring" style={{ position: "relative" }}>
      <svg className="progress-ring__svg" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E07A4A" />
            <stop offset="50%" stopColor="#E8943A" />
            <stop offset="100%" stopColor="#8B6FC0" />
          </linearGradient>
        </defs>
        <circle className="progress-ring__bg" cx="60" cy="60" r={radius} />
        <circle
          className="progress-ring__fill"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="progress-ring__center" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
        <span className="progress-ring__percent">{value}%</span>
        <span className="progress-ring__label">Complete</span>
      </div>
    </div>
  );
}

function App(): JSX.Element {
  const [view, setView] = useState<View>("input");
  const [jsonInput, setJsonInput] = useState(SAMPLE_INPUT);
  const [parseError, setParseError] = useState<string | null>(null);
  const [stepStatuses, setStepStatuses] = useState<PhaseStatus[]>(["pending", "pending", "pending"]);
  const [stepResults, setStepResults] = useState<Record<number, unknown>>({});
  const [workflowResult, setWorkflowResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [streamingText, setStreamingText] = useState<Record<number, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (view === "progress") {
      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [view]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const progressPercent = Math.round(
    (stepStatuses.filter((s) => s === "complete").length / 3) * 100,
  );

  const currentRunningStep = stepStatuses.indexOf("running");

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
    setStepStatuses(["running", "pending", "pending"]);
    setStepResults({});
    setStreamingText({});
    setWorkflowResult(null);
    setView("progress");

    runWorkflow(parsed, {
      onStepProgress(data) {
        setStreamingText((prev) => ({ ...prev, [data.step - 1]: data.text }));
      },
      onStepComplete(result: StepResult) {
        setStepStatuses((prev) => {
          const next = [...prev];
          next[result.step - 1] = "complete";
          if (result.step < 3) next[result.step] = "running";
          return next;
        });
        setStepResults((prev) => ({ ...prev, [result.step - 1]: result.output }));
      },
      onWorkflowComplete(result) {
        setWorkflowResult(result);
        setTimeout(() => setView("results"), 600);
      },
      onError(msg) {
        setError(msg);
      },
    });
  }, [jsonInput]);

  const statusLabel = (s: PhaseStatus) =>
    s === "complete" ? "Done" : s === "running" ? "Running..." : "Waiting";

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header__left">
          <div className="header__logo">
            <div className="header__logo-icon">B</div>
            <span className="header__title">Builder Agent Chain</span>
          </div>
          <nav className="header__nav">
            <button type="button" className="header__nav-item">Input</button>
            <button type="button" className={`header__nav-item ${view === "progress" ? "header__nav-item--active" : ""}`}>Run</button>
            <button type="button" className="header__nav-item">Templates</button>
            <button type="button" className="header__nav-item">History</button>
            <button type="button" className="header__nav-item">Settings</button>
          </nav>
        </div>
        <div className="header__right">
          {view === "progress" && (
            <div className={`header__status-badge ${progressPercent === 100 ? "header__status-badge--complete" : "header__status-badge--running"}`}>
              <span className="header__status-dot" />
              {progressPercent === 100 ? "Complete" : "Running"}
            </div>
          )}
          <div className="header__avatar">U</div>
        </div>
      </header>

      <div className="layout">
        {/* Left Sidebar */}
        <aside className="sidebar">
          <div className="sidebar__section">
            <div className="sidebar__section-title">Workflow Steps</div>
            <div className="step-chain">
              {AGENTS.map((agent, i) => (
                <div key={i} className={`step step--${stepStatuses[i]}`}>
                  <div className={`step__line ${stepStatuses[i] === "complete" ? "step__line--complete" : stepStatuses[i] === "running" ? "step__line--running" : ""}`} />
                  <div className="step__circle">
                    {stepStatuses[i] === "complete" ? "✓" : i + 1}
                  </div>
                  <div className="step__content">
                    <div className="step__label">Agent {i + 1}: {agent.name}</div>
                    <div className="step__desc">{agent.desc}</div>
                    <div className={`step__badge step__badge--${stepStatuses[i]}`}>
                      {statusLabel(stepStatuses[i])}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="content">
          {view === "input" && (
            <div className="input-card">
              <div className="input-card__header">
                <span className="input-card__title">Workflow Input</span>
                <span className="input-card__badge">JSON</span>
              </div>
              <div className="input-card__body">
                <textarea
                  className="input-card__textarea"
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  spellCheck={false}
                />
                {parseError && (
                  <div className="error-banner" style={{ marginTop: 16 }}>
                    <span className="error-banner__icon">!</span>
                    <div className="error-banner__content">
                      <h4>JSON Parse Error</h4>
                      <p>{parseError}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="input-card__footer">
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {jsonInput.length.toLocaleString()} characters
                </span>
                <button type="button" className="btn btn--primary" onClick={handleRun}>
                  Run Workflow &rarr;
                </button>
              </div>
            </div>
          )}

          {view === "progress" && (
            <>
              {AGENTS.map((agent, i) => {
                const status = stepStatuses[i];
                const isActive = i === currentRunningStep;
                if (status === "pending" && !isActive) return null;

                return (
                  <div key={i} className={`agent-card ${isActive ? "agent-card--active" : ""}`}>
                    <div className="agent-card__header">
                      <div className="agent-card__header-left">
                        <div className={`agent-card__icon agent-card__icon--${agent.iconClass}`}>
                          {agent.icon}
                        </div>
                        <div className="agent-card__info">
                          <h3>Agent {i + 1}: {agent.name}</h3>
                          <p>{agent.desc}</p>
                        </div>
                      </div>
                      <div className={`agent-card__status agent-card__status--${status}`}>
                        {status === "running" && <span className="header__status-dot" />}
                        {statusLabel(status)}
                      </div>
                    </div>
                    <div className="agent-card__body">
                      {status === "running" && streamingText[i] ? (
                        <div className="agent-card__output">{streamingText[i]}</div>
                      ) : status === "complete" && stepResults[i] ? (
                        <div className="agent-card__output">
                          {typeof stepResults[i] === "string"
                            ? stepResults[i]
                            : JSON.stringify(stepResults[i], null, 2)}
                        </div>
                      ) : (
                        <div className="agent-card__empty">
                          <div className="agent-card__empty-icon">{agent.icon}</div>
                          <div className="agent-card__empty-text">
                            {status === "running" ? "Initializing agent..." : "Processing..."}
                          </div>
                        </div>
                      )}
                    </div>
                    {status === "running" && streamingText[i] && (
                      <div className="agent-card__footer">
                        <span className="agent-card__meta">
                          {streamingText[i].length.toLocaleString()} characters streamed
                        </span>
                        <span className="agent-card__meta">{formatTime(elapsed)}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {error && (
                <div className="error-banner">
                  <span className="error-banner__icon">!</span>
                  <div className="error-banner__content">
                    <h4>Workflow Error</h4>
                    <p>{error}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {view === "results" && (
            <>
              <div className="results-tabs">
                {AGENTS.map((agent, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`results-tab ${activeTab === i ? "results-tab--active" : ""}`}
                    onClick={() => setActiveTab(i)}
                  >
                    {agent.icon} {agent.name}
                  </button>
                ))}
              </div>
              <div className="results-content">
                <div className="results-content__body">
                  <pre>{JSON.stringify(stepResults[activeTab] ?? workflowResult, null, 2)}</pre>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <button type="button" className="btn btn--primary" onClick={() => { setView("input"); setActiveTab(0); }}>
                  New Workflow
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    const data = JSON.stringify(stepResults[activeTab] ?? workflowResult, null, 2);
                    navigator.clipboard.writeText(data);
                  }}
                >
                  Copy Result
                </button>
              </div>
            </>
          )}
        </main>

        {/* Right Sidebar - Metrics */}
        <aside className="metrics">
          <div className="metrics__section">
            <div className="metrics__title">Progress</div>
            <CircularProgress value={progressPercent} />
          </div>

          <div className="metrics__section">
            <div className="metrics__title">Metrics</div>
            <div className="metric-grid">
              <div className="metric-item">
                <span className="metric-item__label">Steps Done</span>
                <span className="metric-item__value metric-item__value--green">
                  {stepStatuses.filter((s) => s === "complete").length}/3
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-item__label">Elapsed</span>
                <span className="metric-item__value metric-item__value--blue">
                  {formatTime(elapsed)}
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-item__label">Tokens</span>
                <span className="metric-item__value metric-item__value--yellow">
                  {Object.values(streamingText).reduce((sum, t) => sum + t.length, 0).toLocaleString()}
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-item__label">Status</span>
                <span className="metric-item__value">
                  {progressPercent === 100 ? "Done" : view === "progress" ? "Active" : "Idle"}
                </span>
              </div>
            </div>
          </div>

          <div className="metrics__section">
            <div className="metrics__title">Timeline</div>
            <div className="timeline">
              {AGENTS.map((agent, i) => (
                <div key={i} className="timeline__item">
                  <div className={`timeline__dot timeline__dot--${stepStatuses[i]}`} />
                  <div className="timeline__content">
                    <div className="timeline__title">{agent.name}</div>
                    <div className="timeline__time">{statusLabel(stepStatuses[i])}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
