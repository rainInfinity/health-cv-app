/** 实现普通渠道健康记录的单次查询方法。 */

import type { CloudRequestOptions } from '../index';
import type { HttpClient } from '../http/client';
import type { Req, Rsp } from '../types';

/** 当前账号健康记录接口；不编排分页、统计或轮询。 */
export interface MeasurementsApi {
  /** 读取五项指标各自最新的有效记录，无记录时保留 null。 */
  latest(options?: CloudRequestOptions): Promise<Rsp.Measurements.LatestMeasurements>;
  /** 按指标和北京时间日期读取一页，不自动加载整个区间。 */
  list(query: Req.Measurements.MeasurementListParams, options?: CloudRequestOptions): Promise<Rsp.Measurements.MeasurementPage>;
}

/** 创建当前普通渠道健康记录接口。 */
export function createMeasurementsApi(http: HttpClient): MeasurementsApi {
  return {
    latest: (options) =>
      http.request<Rsp.Measurements.LatestMeasurements>({
        method: 'GET',
        path: 'measurements/latest',
        requiresAccessToken: true,
        options,
      }),
    list: (query, options) =>
      http.request<Rsp.Measurements.MeasurementPage>({
        method: 'GET',
        path: 'measurements',
        params: {
          metric: query.metric,
          from: query.from,
          to: query.to,
          offset: query.offset,
          limit: query.limit,
        },
        requiresAccessToken: true,
        options,
      }),
  };
}
