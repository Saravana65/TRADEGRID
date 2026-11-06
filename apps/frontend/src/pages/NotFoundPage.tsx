import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center p-4 bg-background text-center space-y-4">
      <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <AlertCircle className="w-12 h-12" />
      </div>
      <h1 className="text-3xl font-bold font-mono text-white">404 — PAGE NOT FOUND</h1>
      <p className="text-xs text-slate-400 max-w-sm">
        The trading desk or endpoint you requested does not exist on the TRADEGRID platform.
      </p>
      <Link to="/">
        <Button variant="primary" leftIcon={<ArrowLeft className="w-4 h-4" />}>
          Return to Dashboard
        </Button>
      </Link>
    </div>
  );
};
