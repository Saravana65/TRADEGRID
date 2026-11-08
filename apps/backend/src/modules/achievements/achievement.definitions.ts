import { AchievementDefinition } from '@tradegrid/shared-types';

export const STANDARD_ACHIEVEMENTS: AchievementDefinition[] = [
  // Backtesting
  {
    code: 'FIRST_BACKTEST',
    category: 'BACKTESTING',
    name: 'Pioneering Quant',
    description: 'Execute your first algorithmic strategy backtest.',
    badgeIcon: 'Cpu',
    points: 10,
    requiredProgress: 1,
  },
  {
    code: 'STRATEGY_EXPLORER',
    category: 'BACKTESTING',
    name: 'Strategy Explorer',
    description: 'Run backtests across at least 3 distinct algorithmic strategies.',
    badgeIcon: 'Layers',
    points: 25,
    requiredProgress: 3,
  },
  {
    code: 'BACKTEST_10',
    category: 'BACKTESTING',
    name: 'Systematic Tester',
    description: 'Complete 10 quantitative backtests.',
    badgeIcon: 'Activity',
    points: 50,
    requiredProgress: 10,
  },
  {
    code: 'BACKTEST_50',
    category: 'BACKTESTING',
    name: 'Quant Laboratory',
    description: 'Execute 50 rigorous quantitative backtests.',
    badgeIcon: 'FlaskConical',
    points: 100,
    requiredProgress: 50,
  },
  {
    code: 'RISK_CONSCIOUS',
    category: 'BACKTESTING',
    name: 'Risk Conscious',
    description: 'Run a backtest with custom Stop-Loss and Take-Profit risk controls.',
    badgeIcon: 'Shield',
    points: 30,
    requiredProgress: 1,
  },

  // Competition
  {
    code: 'FIRST_COMPETITION_JOINED',
    category: 'COMPETITION',
    name: 'Contender',
    description: 'Register and enter your first trading tournament.',
    badgeIcon: 'Trophy',
    points: 10,
    requiredProgress: 1,
  },
  {
    code: 'COMPETITION_TRADER',
    category: 'COMPETITION',
    name: 'Arena Combatant',
    description: 'Execute your first trade inside an active tournament.',
    badgeIcon: 'Swords',
    points: 25,
    requiredProgress: 1,
  },
  {
    code: 'TOP_10_FINISH',
    category: 'COMPETITION',
    name: 'Leaderboard Elite',
    description: 'Finish in the Top 10 of an official trading competition.',
    badgeIcon: 'Medal',
    points: 50,
    requiredProgress: 1,
  },
  {
    code: 'COMPETITIONS_5',
    category: 'COMPETITION',
    name: 'Tournament Veteran',
    description: 'Participate in 5 multiplayer trading tournaments.',
    badgeIcon: 'Award',
    points: 75,
    requiredProgress: 5,
  },
  {
    code: 'COMPETITION_WINNER',
    category: 'COMPETITION',
    name: 'Grand Champion',
    description: 'Win 1st place in a multiplayer trading competition.',
    badgeIcon: 'Crown',
    points: 150,
    requiredProgress: 1,
  },

  // Trading
  {
    code: 'FIRST_TRADE',
    category: 'TRADING',
    name: 'First Execution',
    description: 'Execute your first stock trade through the matching engine.',
    badgeIcon: 'Zap',
    points: 10,
    requiredProgress: 1,
  },
  {
    code: 'TRADES_10',
    category: 'TRADING',
    name: 'Active Flow',
    description: 'Complete 10 settled market or limit order trades.',
    badgeIcon: 'TrendingUp',
    points: 25,
    requiredProgress: 10,
  },
  {
    code: 'TRADES_50',
    category: 'TRADING',
    name: 'Seasoned Trader',
    description: 'Complete 50 settled market or limit order trades.',
    badgeIcon: 'BarChart2',
    points: 75,
    requiredProgress: 50,
  },
  {
    code: 'TRADES_100',
    category: 'TRADING',
    name: 'Centurion Flow',
    description: 'Complete 100 settled market or limit order trades.',
    badgeIcon: 'Flame',
    points: 150,
    requiredProgress: 100,
  },
  {
    code: 'DIVERSIFIED_TRADER',
    category: 'TRADING',
    name: 'Sector Diversified',
    description: 'Simultaneously hold portfolio positions across 3 or more sectors.',
    badgeIcon: 'PieChart',
    points: 40,
    requiredProgress: 3,
  },

  // Learning & Social
  {
    code: 'CHART_CUSTOMIZER',
    category: 'LEARNING',
    name: 'Chart Artisan',
    description: 'Customize and save your technical chart studio workspace.',
    badgeIcon: 'Sliders',
    points: 15,
    requiredProgress: 1,
  },
  {
    code: 'INDICATOR_ANALYST',
    category: 'LEARNING',
    name: 'Technical Analyst',
    description: 'Analyze an instrument using Estimated Volume Profile or multi-indicators.',
    badgeIcon: 'LineChart',
    points: 20,
    requiredProgress: 1,
  },
  {
    code: 'PORTFOLIO_REVIEWED',
    category: 'LEARNING',
    name: 'Prudent Investor',
    description: 'Generate an AI Portfolio Health & Concentration Risk review.',
    badgeIcon: 'Sparkles',
    points: 20,
    requiredProgress: 1,
  },
  {
    code: 'CHAT_PARTICIPANT',
    category: 'LEARNING',
    name: 'Community Voice',
    description: 'Participate in trader discussions in Global Chat or a Symbol Room.',
    badgeIcon: 'MessageSquare',
    points: 15,
    requiredProgress: 1,
  },
];

export const ACHIEVEMENTS_BY_CODE = new Map<string, AchievementDefinition>(
  STANDARD_ACHIEVEMENTS.map((a) => [a.code, a])
);

export function getAchievementDefinition(code: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS_BY_CODE.get(code);
}
