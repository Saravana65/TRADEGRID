import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { AlertTriangle } from 'lucide-react';

export const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <Navbar />

        {/* Global Educational Simulator Banner */}
        <div className="bg-amber-950/40 border-b border-amber-800/30 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-amber-300 font-mono select-none">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
          <span>
            <strong>EDUCATIONAL TRADING SIMULATOR:</strong> All funds ($100,000 virtual), orders, and market dynamics are simulated. No real currency is involved.
          </span>
        </div>

        {/* Scrollable View Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-background">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
