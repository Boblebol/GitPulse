import {
  BarChart3,
  BookOpen,
  Boxes,
  CalendarRange,
  Database,
  FileText,
  GitBranch,
  GitPullRequest,
  LineChart,
  MonitorDown,
  Rocket,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Workflow,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const repoUrl = "https://github.com/Boblebol/GitPulse";

const features = [
  {
    icon: <GitBranch size={22} />,
    title: "Repository scanner",
    text: "Scan local Git repositories by workspace and branch without mutating the user's working tree.",
  },
  {
    icon: <BarChart3 size={22} />,
    title: "Scoped analytics",
    text: "Compare one repo or every repo in a workspace with shared time filters and stable aggregate tables.",
  },
  {
    icon: <Users size={22} />,
    title: "Developer aliases",
    text: "Merge identities or move one alias at a time, then refresh statistics without reparsing Git history.",
  },
  {
    icon: <CalendarRange size={22} />,
    title: "Time ranges",
    text: "Use all time, custom ranges, last 7/14/30/90 days, and week or month navigation.",
  },
  {
    icon: <LineChart size={22} />,
    title: "Dashboard",
    text: "Read top developers, top files, activity timelines, commits, churn, files touched, and streaks.",
  },
  {
    icon: <FileText size={22} />,
    title: "Weekly recaps",
    text: "Regenerate a weekly repo or workspace summary and copy deterministic Markdown for reviews or OSS updates.",
  },
  {
    icon: <ShieldCheck size={22} />,
    title: "Watchlists & compare",
    text: "Track important repos, files, or directories and compare current activity against the previous period.",
  },
  {
    icon: <BookOpen size={22} />,
    title: "Shareable reports",
    text: "Copy deterministic Markdown for Dashboard, Code Health, and Weekly Recap updates without sending data anywhere.",
  },
  {
    icon: <Sparkles size={22} />,
    title: "Code health achievements",
    text: "Surface cooled hotspots, knowledge spread, lower volatility, and cleanup periods without ranking individual output.",
  },
  {
    icon: <Boxes size={22} />,
    title: "Box scores",
    text: "Turn daily activity into player-style scorecards with an editable formula stored in SQLite.",
  },
];

const docs = [
  ["README", "Setup, development commands, architecture summary.", `${repoUrl}/blob/master/README.md`],
  ["PRD", "Product requirements and core feature scope.", `${repoUrl}/blob/master/prd_md.md`],
  ["Architecture", "Repository architecture notes and implementation context.", `${repoUrl}/blob/master/architecture_md.md`],
  ["V2 plan", "Completed plan for scoped stats, time filters, dashboard, branches, and aliases.", `${repoUrl}/blob/master/docs/development-plan-v2.md`],
  ["Retention roadmap", "Versioned plan for tours, demo mode, insights, recaps, and return workflows.", `${repoUrl}/blob/master/docs/superpowers/plans/2026-04-26-retention-product-roadmap.md`],
  ["Release process", "How maintainers prepare tags and publish desktop builds.", `${repoUrl}/blob/master/docs/release.md`],
  ["Changelog", "Human-readable release history.", `${repoUrl}/blob/master/CHANGELOG.md`],
];

const tutorials = [
  {
    title: "Install locally",
    steps: ["Install Rust and Tauri prerequisites.", "Run pnpm install.", "Start the desktop app with pnpm tauri dev."],
  },
  {
    title: "Scan your first repo",
    steps: ["Create or select a workspace.", "Add a local Git repository path.", "Choose the active branch.", "Run Sync to index commits."],
  },
  {
    title: "Analyze several repos",
    steps: ["Add multiple repos to the same workspace.", "Use the scope toggle to switch from repo to workspace.", "Compare totals across Dashboard, Developers, and Box Score."],
  },
  {
    title: "Use time filters",
    steps: ["Select a preset range or custom dates.", "Use week or month navigation for reviews.", "Read top files and timelines for that range."],
  },
  {
    title: "Prepare a weekly recap",
    steps: ["Select a repo or switch to workspace scope.", "Open Weekly Recap.", "Pick the week to regenerate.", "Copy the Markdown into a review note or release update."],
  },
  {
    title: "Track code areas",
    steps: ["Open Watchlists.", "Add a file, directory, or selected repo.", "Use a bounded time range.", "Review commits, churn, hotspot, silo, and volatility deltas."],
  },
  {
    title: "Share a report",
    steps: ["Select the repo or workspace scope.", "Open Reports.", "Pick Dashboard, Code Health, or Weekly Recap.", "Copy the generated Markdown into your update."],
  },
  {
    title: "Review achievements",
    steps: ["Select a bounded time range.", "Open Achievements.", "Review code health wins.", "Ignore any nudge that is not useful for the current workflow."],
  },
  {
    title: "Switch branches",
    steps: ["Open Settings.", "Pick a branch in the repository row.", "Sync again to scan commits for that branch cursor."],
  },
  {
    title: "Clean developer aliases",
    steps: ["Open Alias Manager.", "Merge duplicate developers when every alias belongs together.", "Move a single alias when only one Git identity needs reassignment."],
  },
  {
    title: "Build from source",
    steps: ["Run pnpm build for the frontend.", "Run cargo test and clippy in src-tauri.", "Run pnpm tauri build to create desktop bundles."],
  },
  {
    title: "Publish a release",
    steps: ["Update versions and CHANGELOG.md.", "Commit release prep on master.", "Push a vX.Y.Z tag.", "Review and publish the generated GitHub Release draft."],
  },
];

const commands = [
  ["Install", "pnpm install"],
  ["Run web UI", "pnpm dev"],
  ["Run desktop app", "pnpm tauri dev"],
  ["Frontend tests", "pnpm exec jest --runInBand"],
  ["Frontend build", "pnpm build"],
  ["Docs site build", "pnpm run site:build"],
  ["Rust tests", "cd src-tauri && cargo test"],
  ["Rust lint", "cd src-tauri && cargo clippy --all-targets -- -D warnings"],
  ["Desktop bundles", "pnpm tauri build"],
];

function ProductPreview() {
  return (
    <div className="product-preview" aria-label="GitPulse dashboard preview">
      <div className="preview-sidebar">
        <div className="preview-logo">GP</div>
        <span>Dashboard</span>
        <span>Files</span>
        <span>Developers</span>
        <span>Box Scores</span>
        <span>Aliases</span>
        <span>Achievements</span>
      </div>
      <div className="preview-main">
        <div className="preview-top">
          <span>Workspace: Platform</span>
          <span>Range: Last 30 days</span>
        </div>
        <div className="metric-grid">
          <div><strong>286</strong><span>commits</span></div>
          <div><strong>42</strong><span>files hot</span></div>
          <div><strong>8</strong><span>developers</span></div>
        </div>
        <div className="preview-chart">
          <span style={{ height: "42%" }} />
          <span style={{ height: "74%" }} />
          <span style={{ height: "58%" }} />
          <span style={{ height: "86%" }} />
          <span style={{ height: "52%" }} />
          <span style={{ height: "68%" }} />
          <span style={{ height: "79%" }} />
        </div>
        <div className="preview-list">
          <div><span>Hotspot cooled down</span><strong>impact 3</strong></div>
          <div><span>src/scanner.rs</span><strong>co-touch 18</strong></div>
          <div><span>Dashboard.tsx</span><strong>churn 12.4</strong></div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <main>
      <nav className="top-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="GitPulse home">
          <span>GitPulse</span>
        </a>
        <div className="nav-links">
          <a href="#architecture">Architecture</a>
          <a href="#docs">Docs</a>
          <a href="#tutorials">Tutorials</a>
          <a href="#releases">Releases</a>
          <a href={repoUrl}>GitHub</a>
        </div>
      </nav>

      <section id="top" className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Local-first Git analytics</p>
          <h1>GitPulse</h1>
          <p className="hero-text">
            Scan local repositories, compare developer activity, inspect file churn, manage aliases, and build NBA-style daily engineering box scores.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#quick-start">
              <Terminal size={18} />
              Build from source
            </a>
            <a className="button secondary" href={repoUrl}>
              <GitPullRequest size={18} />
              View repository
            </a>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section className="feature-band" aria-label="Product features">
        {features.map((feature) => (
          <article className="feature-card" key={feature.title}>
            <div className="feature-icon">{feature.icon}</div>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <section id="architecture" className="section">
        <div className="section-heading">
          <p className="eyebrow">Architecture</p>
          <h2>Desktop app, local database, derived analytics.</h2>
          <p>
            GitPulse keeps raw Git facts and derived statistics local. The scanner writes commits and file changes into SQLite, then rebuilds only dirty aggregate scopes after scans.
          </p>
        </div>
        <div className="flow">
          <div><GitBranch size={24} /><strong>Git objects</strong><span>Read commits and branch history through git2.</span></div>
          <div><Database size={24} /><strong>SQLite facts</strong><span>Persist repos, commits, files, aliases, and scan runs.</span></div>
          <div><Workflow size={24} /><strong>Aggregates</strong><span>Refresh developer, file, directory, and daily tables.</span></div>
          <div><MonitorDown size={24} /><strong>Tauri UI</strong><span>React views query fast aggregate tables.</span></div>
        </div>
      </section>

      <section id="docs" className="section alt">
        <div className="section-heading">
          <p className="eyebrow">Documentation</p>
          <h2>Everything needed to understand and extend GitPulse.</h2>
        </div>
        <div className="doc-grid">
          {docs.map(([title, text, href]) => (
            <a className="doc-link" href={href} key={title}>
              <FileText size={20} />
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </a>
          ))}
        </div>
      </section>

      <section id="tutorials" className="section">
        <div className="section-heading">
          <p className="eyebrow">Tutorials</p>
          <h2>Common workflows from first run to public release.</h2>
        </div>
        <div className="tutorial-grid">
          {tutorials.map((tutorial, index) => (
            <article className="tutorial" key={tutorial.title}>
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{tutorial.title}</h3>
              <ol>
                {tutorial.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section id="quick-start" className="section split-section">
        <div>
          <p className="eyebrow">Build</p>
          <h2>Run and package GitPulse locally.</h2>
          <p>
            Contributors need Node, pnpm, Rust, and the Tauri platform prerequisites for their OS. The same commands run locally and in CI.
          </p>
        </div>
        <div className="command-list">
          {commands.map(([label, command]) => (
            <div className="command-row" key={label}>
              <span>{label}</span>
              <code>{command}</code>
            </div>
          ))}
        </div>
      </section>

      <section id="releases" className="section alt split-section">
        <div>
          <p className="eyebrow">Releases</p>
          <h2>Tag-driven desktop publishing.</h2>
          <p>
            A `vX.Y.Z` tag starts the release workflow. GitHub Actions builds Linux, macOS, and Windows bundles and attaches them to a draft release for review.
          </p>
          <div className="hero-actions compact">
            <a className="button primary" href={`${repoUrl}/blob/master/docs/release.md`}>
              <Rocket size={18} />
              Release process
            </a>
            <a className="button secondary" href={`${repoUrl}/blob/master/CHANGELOG.md`}>
              <BookOpen size={18} />
              Changelog
            </a>
          </div>
        </div>
        <div className="release-panel">
          <div><ShieldCheck size={20} /><strong>CI gate</strong><span>Tests, build, clippy, and site build.</span></div>
          <div><Rocket size={20} /><strong>Release draft</strong><span>Created from tag builds with artifacts.</span></div>
          <div><BookOpen size={20} /><strong>Changelog</strong><span>Manual notes stay readable and public.</span></div>
        </div>
      </section>

      <footer>
        <span>GitPulse</span>
        <span>Local-first Git analytics for desktop teams.</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
