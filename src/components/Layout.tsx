import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import ProductTour from "./ProductTour";
import ScanProgressEvents from "./ScanProgressEvents";
import { ToastContainer } from "./Toast";

export default function Layout() {
  return (
    <div className="flex h-full bg-surface text-on-surface">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar />
      <ScanProgressEvents />
      <main id="main-content" aria-label="GitPulse workspace" className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <ProductTour />
      <ToastContainer />
    </div>
  );
}
