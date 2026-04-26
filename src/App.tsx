import { Suspense, lazy, type ReactNode } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import Layout from "./components/Layout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Developers = lazy(() => import("./pages/Developers"));
const Files = lazy(() => import("./pages/Files"));
const BoxScore = lazy(() => import("./pages/BoxScore"));
const AliasManager = lazy(() => import("./pages/AliasManager"));
const Insights = lazy(() => import("./pages/Insights"));
const WeeklyRecap = lazy(() => import("./pages/WeeklyRecap"));
const Watchlists = lazy(() => import("./pages/Watchlists"));
const Reports = lazy(() => import("./pages/Reports"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Seasons = lazy(() => import("./pages/Seasons"));
const Awards = lazy(() => import("./pages/Awards"));
const Records = lazy(() => import("./pages/Records"));
const HallOfFame = lazy(() => import("./pages/HallOfFame"));
const CodeHealth = lazy(() => import("./pages/CodeHealth"));
const Settings = lazy(() => import("./pages/Settings"));

function RouteFallback() {
  return (
    <div className="p-6 text-sm text-on-surface-variant">
      Loading…
    </div>
  );
}

function route(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: route(<Dashboard />) },
      { path: "developers", element: route(<Developers />) },
      { path: "files", element: route(<Files />) },
      { path: "boxscore", element: route(<BoxScore />) },
      { path: "aliases", element: route(<AliasManager />) },
      { path: "insights", element: route(<Insights />) },
      { path: "weekly-recap", element: route(<WeeklyRecap />) },
      { path: "watchlists", element: route(<Watchlists />) },
      { path: "reports", element: route(<Reports />) },
      { path: "achievements", element: route(<Achievements />) },
      { path: "seasons", element: route(<Seasons />) },
      { path: "awards", element: route(<Awards />) },
      { path: "records", element: route(<Records />) },
      { path: "hall-of-fame", element: route(<HallOfFame />) },
      { path: "health", element: route(<CodeHealth />) },
      { path: "settings", element: route(<Settings />) },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
