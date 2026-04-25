import { createHashRouter, RouterProvider } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Developers from "./pages/Developers";
import Files from "./pages/Files";
import BoxScore from "./pages/BoxScore";
import AliasManager from "./pages/AliasManager";
import Settings from "./pages/Settings";

const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "developers", element: <Developers /> },
      { path: "files", element: <Files /> },
      { path: "boxscore", element: <BoxScore /> },
      { path: "aliases", element: <AliasManager /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
