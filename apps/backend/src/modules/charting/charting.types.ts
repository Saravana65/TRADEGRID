import {
  ChartType,
  IndicatorConfig,
  VolumeProfileConfig,
  UserChartPreference,
} from '@tradegrid/shared-types';

export interface UserChartPreferenceRow {
  id: number;
  user_id: number;
  symbol: string;
  interval: string;
  chart_type: string;
  indicators_config: string | IndicatorConfig[];
  volume_profile_config: string | VolumeProfileConfig;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface IChartPreferenceRepository {
  findByUserAndSymbol(userId: number, symbol: string): Promise<UserChartPreference | null>;
  findDefaultByUser(userId: number): Promise<UserChartPreference | null>;
  findAllByUser(userId: number): Promise<UserChartPreference[]>;
  savePreference(preference: UserChartPreference): Promise<UserChartPreference>;
  deletePreference(userId: number, symbol: string): Promise<boolean>;
}
