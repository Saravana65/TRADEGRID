import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { motion, AnimatePresence } from 'motion/react';

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
