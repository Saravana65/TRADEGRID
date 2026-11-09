import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const location = useLocation();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <Navbar />

        {/* Global Educational Simulator Banner */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/30 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-amber-800 dark:text-amber-300 font-sans select-none">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>EDUCATIONAL TRADING SIMULATOR:</strong> All funds ($100,000 virtual starting cash), orders, and market dynamics are strictly simulated. No real currency is involved.
          </span>
        </div>

        {/* Scrollable View Content with Motion Transitions */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-background">
          <div className="max-w-[1600px] mx-auto space-y-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};
