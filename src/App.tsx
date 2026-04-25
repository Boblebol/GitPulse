import { Suspense, lazy, type ReactNode } from "react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import Layout from "./components/Layout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Developers = lazy(() => import("./pages/Developers"));
const Files = lazy(() => import("./pages/Files"));
const BoxScore = lazy(() => import("./pages/BoxScore"));
const AliasManager = lazy(() => import("./pages/AliasManager"));
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
      { path: "settings", element: route(<Settings />) },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
