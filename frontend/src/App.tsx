 import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5080";

type EvaluationRun = {
  id: number;
  input: string;
  modelName?: string;
  modelResponse: string;
  passed: boolean;
  createdAt: string;

  semanticSimilarity?: number | null;
  generationLatencyMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  retryCount?: number;
};

type Summary = {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
};

function App() {
  const [input, setInput] = useState("Classify this expense: lunch RM15");
  const [expectedAnswer, setExpectedAnswer] = useState("Food");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelName, setModelName] = useState("qwen2.5:1.5b");

  async function refreshDashboard() {
    setLoading(true);

    try {
      const [summaryResponse, historyResponse] = await Promise.all([
        fetch(`${API}/api/ModelRuns/summary`),
        fetch(`${API}/api/ModelRuns?page=1&pageSize=10`),
      ]);

      if (!summaryResponse.ok || !historyResponse.ok) {
        throw new Error("API request failed.");
      }

      setSummary(await summaryResponse.json());
      const history = await historyResponse.json();
      setRuns(history.runs ?? []);
    } catch {
      setResult("Cannot connect to the API. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshDashboard();
  }, []);

  async function runEvaluation() {
    setBusy(true);
    setResult("");

    try {
      const response = await fetch(`${API}/api/ModelRuns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          modelName,
          rules: [
            { type: "exact_match", expected: "Food" },
            { type: "required_keyword", keyword: "Food" },
            { type: "minimum_length", min: 4 },
            {
              type: "semantic_similarity",
              expected: expectedAnswer,
              threshold: 0.80,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
      await refreshDashboard();
    } catch (error) {
      setResult(
        error instanceof Error ? error.message : "Evaluation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function compareBothModels() {
  setBusy(true);
  setResult("");

  const rules = [
    { type: "exact_match", expected: "Food" },
    { type: "required_keyword", keyword: "Food" },
    { type: "minimum_length", min: 4 },
    {
      type: "semantic_similarity",
      expected: expectedAnswer,
      threshold: 0.80,
    },
  ];

  const models = ["qwen2.5:1.5b", "qwen2.5:0.5b"];

  try {
    const results = await Promise.all(
      models.map(async (model) => {
        const response = await fetch(`${API}/api/ModelRuns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input,
            modelName: model,
            rules,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `${model}: ${await response.text()}`
          );
        }

        return {
          model,
          result: await response.json(),
        };
      })
    );

    setResult(JSON.stringify(results, null, 2));
    await refreshDashboard();
  } catch (error) {
    setResult(
      error instanceof Error
        ? error.message
        : "Model comparison failed."
    );
  } finally {
    setBusy(false);
  }
  }

  const dailyResults = useMemo(() => {
    const grouped = new Map<
      string,
      { date: string; passed: number; failed: number; total: number }
    >();

    runs.forEach((run) => {
      const parsedDate = new Date(run.createdAt);
      if (Number.isNaN(parsedDate.getTime())) return;

      const date = parsedDate.toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
      });

      if (!grouped.has(date)) {
        grouped.set(date, { date, passed: 0, failed: 0, total: 0 });
      }

      const entry = grouped.get(date)!;
      if (run.passed) entry.passed++;
      else entry.failed++;

      entry.total++;
    });

    return Array.from(grouped.values()).reverse();
  }, [runs]);

 
    const modelComparisons = useMemo(() => {
    const modelNames = ["qwen2.5:1.5b", "qwen2.5:0.5b"];

    return modelNames.map((name) => {
      const modelRuns = runs.filter(
        (run) => (run.modelName ?? "qwen2.5:1.5b") === name
      );

      const total = modelRuns.length;
      const average = (values: number[]) =>
        values.length
          ? values.reduce((sum, value) => sum + value, 0) / values.length
          : null;

      const similarities = modelRuns
        .map((run) => run.semanticSimilarity)
        .filter((value): value is number => value != null);

      const latencies = modelRuns
        .map((run) => run.generationLatencyMs)
        .filter((value): value is number => value != null);

      const promptTokens = modelRuns
        .map((run) => run.promptTokens)
        .filter((value): value is number => value != null);

      const completionTokens = modelRuns
        .map((run) => run.completionTokens)
        .filter((value): value is number => value != null);

      const retries = modelRuns
        .map((run) => run.retryCount)
        .filter((value): value is number => value != null);

      const passed = modelRuns.filter((run) => run.passed).length;

      return {
        name,
        total,
        passRate: total ? (passed / total) * 100 : null,
        similarity: average(similarities),
        latency: average(latencies),
        promptTokens: average(promptTokens),
        completionTokens: average(completionTokens),
        retries: average(retries),
      };
    });
  }, [runs]);

  const maxDailyRuns = Math.max(
    1,
    ...dailyResults.map((day) => day.total),
  );

  const passPercentage =
    summary && summary.total > 0
      ? (summary.passed / summary.total) * 100
      : 0;

  const failPercentage =
    summary && summary.total > 0
      ? (summary.failed / summary.total) * 100
      : 0;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a className="sidebar-brand" href="#dashboard">
          <span className="brand-mark">M</span>
          <span>ModelBench</span>
        </a>

        <div className="sidebar-section">
          <p className="sidebar-label">WORKSPACE</p>

          <nav className="sidebar-nav">
            <a className="nav-item active" href="#dashboard">
              <span className="nav-icon">▦</span>
              Dashboard
            </a>

            <a className="nav-item" href="#evaluations">
              <span className="nav-icon">◷</span>
              Evaluations
            </a>

            <a className="nav-item" href="#run-evaluation">
              <span className="nav-icon">＋</span>
              Run evaluation
            </a>
          </nav>
        </div>

        <div className="sidebar-section system-section">
          <p className="sidebar-label">SYSTEM</p>
          <span className="nav-item disabled-nav" title="Settings are not available yet">
            <span className="nav-icon">⚙</span>
            Settings
          </span>
        </div>

        <div className="sidebar-footer">
          <span className="sidebar-status-dot" />
          ModelBench is running
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI QUALITY PLATFORM</p>
            <h1>Dashboard</h1>
            <p className="subtitle">
              Monitor, evaluate and improve AI model performance.
            </p>
          </div>

          <button
            className="secondary"
            onClick={refreshDashboard}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "↻ Refresh data"}
          </button>
        </header>

        <section id="dashboard" className="stats">
          <article className="card stat-card">
            <span className="stat-label">Total runs</span>
            <strong>{summary?.total ?? "—"}</strong>
            <span className="stat-note">All recorded evaluations</span>
          </article>

          <article className="card stat-card">
            <span className="stat-label">Passed</span>
            <strong className="green-text">{summary?.passed ?? "—"}</strong>
            <span className="stat-note">Successful evaluations</span>
          </article>

          <article className="card stat-card">
            <span className="stat-label">Failed</span>
            <strong className="red-text">{summary?.failed ?? "—"}</strong>
            <span className="stat-note">Unsuccessful evaluations</span>
          </article>

          <article className="card stat-card">
            <span className="stat-label">Pass rate</span>
            <strong>{summary ? `${summary.passRate}%` : "—"}</strong>
            <span className="stat-note">Overall success rate</span>
          </article>
        </section>

        <section className="charts-grid">
          <article className="card chart-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PERFORMANCE</p>
                <h2>Overall outcomes</h2>
              </div>
              <span className="chart-period">All time</span>
            </div>

            <div className="outcome-summary">
              <div className="outcome-number">
                <strong>{summary?.total ?? "—"}</strong>
                <span>Total runs</span>
              </div>

              <div className="outcome-details">
                <div className="outcome-bar">
                  <div
                    className="outcome-passed"
                    style={{ width: `${passPercentage}%` }}
                  />
                  <div
                    className="outcome-failed"
                    style={{ width: `${failPercentage}%` }}
                  />
                </div>

                <div className="legend">
                  <span><i className="legend-dot passed-dot" /> Passed</span>
                  <strong>{summary?.passed ?? "—"}</strong>
                </div>

                <div className="legend">
                  <span><i className="legend-dot failed-dot" /> Failed</span>
                  <strong>{summary?.failed ?? "—"}</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="card chart-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">RECENT ACTIVITY</p>
                <h2>Evaluation trends</h2>
              </div>
              <span className="chart-period">Latest 10 runs</span>
            </div>

            {dailyResults.length === 0 ? (
              <div className="empty-chart">
                No evaluation data available yet.
              </div>
            ) : (
              <div className="activity-chart">
                {dailyResults.map((day) => {
                  const height = (day.total / maxDailyRuns) * 100;
                  const passedHeight = (day.passed / day.total) * 100;
                  const failedHeight = (day.failed / day.total) * 100;

                  return (
                    <div className="chart-column" key={day.date}>
                      <span className="bar-total">{day.total}</span>
                      <div className="bar-area">
                        <div
                          className="daily-bar"
                          style={{ height: `${height}%` }}
                          title={`${day.passed} passed, ${day.failed} failed`}
                        >
                          <div
                            className="daily-passed"
                            style={{ height: `${passedHeight}%` }}
                          />
                          <div
                            className="daily-failed"
                            style={{ height: `${failedHeight}%` }}
                          />
                        </div>
                      </div>
                      <span className="bar-date">{day.date}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="chart-legend">
              <span><i className="legend-dot passed-dot" /> Passed</span>
              <span><i className="legend-dot failed-dot" /> Failed</span>
            </div>
          </article>
        </section>
        
                <section className="card comparison-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MODEL BENCHMARK</p>
              <h2>Model comparison</h2>
              <p className="panel-description">
                Performance across the latest recorded evaluations.
              </p>
            </div>
          </div>

          <div className="comparison-grid">
            {modelComparisons.map((model) => (
              <article className="comparison-card" key={model.name}>
                <h3>{model.name}</h3>
                <p className="comparison-runs">
                  {model.total} recorded runs
                </p>

                <div className="comparison-metric">
                  <span>Pass rate</span>
                  <strong>
                    {model.passRate != null
                      ? `${model.passRate.toFixed(1)}%`
                      : "—"}
                  </strong>
                </div>

                <div className="comparison-metric">
                  <span>Avg. similarity</span>
                  <strong>
                    {model.similarity != null
                      ? `${(model.similarity * 100).toFixed(1)}%`
                      : "—"}
                  </strong>
                </div>

                <div className="comparison-metric">
                  <span>Avg. latency</span>
                  <strong>
                    {model.latency != null
                      ? `${model.latency.toFixed(0)} ms`
                      : "—"}
                  </strong>
                </div>

                <div className="comparison-metric">
                  <span>Avg. tokens (P/C)</span>
                  <strong>
                    {model.promptTokens != null &&
                    model.completionTokens != null
                      ? `${model.promptTokens.toFixed(0)} / ${model.completionTokens.toFixed(0)}`
                      : "—"}
                  </strong>
                </div>

                <div className="comparison-metric">
                  <span>Avg. retries</span>
                  <strong>
                    {model.retries != null
                      ? model.retries.toFixed(1)
                      : "—"}
                  </strong>
                </div>
              </article>
            ))}
          </div>
        </section>


        <section id="run-evaluation" className="card test-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TEST YOUR MODEL</p>
              <h2>Run an AI evaluation</h2>
              <p className="panel-description">
                Generate a response with Ollama, then evaluate it with Rust.
              </p>
            </div>
          </div>

          <label htmlFor="model-input">Test input</label>
          <textarea
            id="model-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
          />
          <label htmlFor="expected-answer">Expected answer</label>
          <textarea
            id="expected-answer"
            value={expectedAnswer}
            onChange={(event) => setExpectedAnswer(event.target.value)}
            rows={2}
          />
          
          <div className="model-select-group">
            <label htmlFor="model-select">AI Model</label>

            <select
              id="model-select"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            >
              <option value="qwen2.5:1.5b">
                Qwen 2.5 — 1.5B (Larger)
              </option>

              <option value="qwen2.5:0.5b">
                Qwen 2.5 — 0.5B (Smaller)
              </option>
            </select>
          </div>

          <div className="evaluation-actions">
            <button
              onClick={runEvaluation}
              disabled={busy || !input.trim()}
            >
              {busy ? "Running evaluation..." : "Run evaluation →"}
            </button>

            <button
              className="secondary"
              onClick={compareBothModels}
              disabled={busy || !input.trim()}
            >
              Compare Both Models
            </button>
          </div>
          
          {/* <button
            onClick={compareBothModels}
            disabled={busy}
          >
            Compare Both Models
          </button> */}

          {result && <pre className="result">{result}</pre>}
        </section>

        <section id="evaluations" className="card recent-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">HISTORY</p>
              <h2>Recent evaluations</h2>
              <p className="panel-description">
                Your latest recorded model evaluation results.
              </p>
            </div>
            <span className="record-count">{runs.length} records</span>
          </div>

          {runs.length === 0 ? (
            <p className="empty-state">
              No runs loaded yet. Run an evaluation to get started.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                <tr>
                  <th>Model</th>
                  <th>ID</th>
                  <th>Input</th>
                  <th>AI response</th>
                  <th>Result</th>
                  <th>Similarity</th>
                  <th>Latency</th>
                  <th>Tokens (P/C)</th>
                  <th>Retries</th>
                    
                </tr>

                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>{run.modelName ?? "qwen2.5:1.5b"}</td>
                      <td className="id-cell">#{run.id}</td>
                      <td>{run.input}</td>
                      <td>{run.modelResponse}</td>
                      
                      <td>
                        <span className={`status ${run.passed ? "passed" : "failed"}`}>
                          <span className="status-dot" />
                          {run.passed ? "Passed" : "Failed"}
                        </span>
                      </td>

                      <td>
                        {run.semanticSimilarity != null
                          ? `${(run.semanticSimilarity * 100).toFixed(1)}%`
                          : "—"}
                      </td>

                      <td>
                        {run.generationLatencyMs != null
                          ? `${run.generationLatencyMs.toFixed(0)} ms`
                          : "—"}
                      </td>

                      <td>
                        {run.promptTokens ?? "—"} / {run.completionTokens ?? "—"}
                      </td>

                      <td>{run.retryCount ?? "—"}</td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="footer">
          <span>ModelBench</span>
          <span>AI evaluation and quality monitoring</span>
        </footer>
      </main>
    </div>
  );
}

export default App;