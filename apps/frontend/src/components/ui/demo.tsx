import { useState } from "react";
import { LeadsTable } from "@/components/ui/leads-data-table";
import { StocksDataTable } from "@/components/ui/stocks-data-table";

export default function DemoOne() {
  const [activeTab, setActiveTab] = useState<"stocks" | "leads">("stocks");

  return (
    <div className="w-full min-h-screen bg-background p-6 space-y-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between border-b border-border/20 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-foreground tracking-tight">
            Data Table Component Showcase
          </h1>
          <p className="text-xs text-muted-foreground">
            Smooth spring animations, trend sparklines, multi-row selection, and floating quick-actions.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/30">
          <button
            onClick={() => setActiveTab("stocks")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "stocks"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📈 Stock Updates View
          </button>
          <button
            onClick={() => setActiveTab("leads")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "leads"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            👥 Leads View
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {activeTab === "stocks" ? (
          <StocksDataTable title="TradeGrid Live Market Scanner" />
        ) : (
          <LeadsTable title="Enterprise Leads Directory" />
        )}
      </div>
    </div>
  );
}
