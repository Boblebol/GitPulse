import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileCode2,
  Trophy,
  GitMerge,
  CalendarDays,
  Award,
  History,
  HeartPulse,
  Settings,
  Zap,
} from "lucide-react";
import { useWorkspaces } from "../hooks/useRepos";
import { useRepos } from "../hooks/useRepos";
import { useAppContext } from "../context/AppContext";
import AnalysisScopeToggle from "./AnalysisScopeToggle";

const NAV = [
  { to: "/",            label: "Dashboard",    Icon: LayoutDashboard },
  { to: "/developers",  label: "Developers",   Icon: Users           },
  { to: "/files",       label: "Files",        Icon: FileCode2       },
  { to: "/boxscore",    label: "Box Score",    Icon: Trophy          },
  { to: "/aliases",     label: "Aliases",      Icon: GitMerge        },
  { to: "/seasons",     label: "Seasons",      Icon: CalendarDays    },
  { to: "/awards",      label: "Awards",       Icon: Award           },
  { to: "/records",     label: "Records",      Icon: History         },
  { to: "/health",      label: "Code Health",  Icon: HeartPulse      },
  { to: "/settings",    label: "Settings",     Icon: Settings        },
];

export default function Sidebar() {
  const {
    workspaceId,
    repoId,
    setWorkspaceId,
    setRepoId,
    analysisScopeMode,
    setAnalysisScopeMode,
  } = useAppContext();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: repos = [] } = useRepos(workspaceId);

  return (
    <aside className="flex flex-col h-full w-56 bg-surface-container-low shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2">
        <Zap size={20} className="text-primary-container" fill="#f26522" />
        <span
          className="text-lg font-bold tracking-tight text-on-surface"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          GitPulse
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-surface-container-highest text-primary"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
              ].join(" ")
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Repo selector */}
      <div className="px-3 pb-4 pt-3 space-y-2 border-t border-outline-variant/15">
        {/* Workspace select */}
        <div>
          <label className="text-xs text-on-surface-variant mb-1 block">Workspace</label>
          <select
            value={workspaceId ?? ""}
            onChange={(e) => {
              setWorkspaceId(e.target.value || null);
              setRepoId(null);
            }}
            className="w-full bg-surface-container text-on-surface text-sm rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
          >
            <option value="">— select —</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        </div>

        {/* Repo select */}
        <div>
          <label className="text-xs text-on-surface-variant mb-1 block">Repository</label>
          <select
            value={repoId ?? ""}
            onChange={(e) => setRepoId(e.target.value || null)}
            disabled={!workspaceId}
            className="w-full bg-surface-container text-on-surface text-sm rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer disabled:opacity-40"
          >
            <option value="">— select —</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-on-surface-variant mb-1 block">Stats Scope</label>
          <AnalysisScopeToggle
            mode={analysisScopeMode}
            onChange={setAnalysisScopeMode}
            disabled={!workspaceId}
          />
        </div>
      </div>
    </aside>
  );
}
