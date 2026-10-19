/** 实现普通渠道模型目录的单次请求方法。 */

import type { CloudRequestOptions } from '../index';
import type { HttpClient } from '../http/client';
import type { Req, Rsp } from '../types';

/** 普通渠道模型目录接口。 */
export interface ModelsApi {
  /** 读取当前渠道可用模型的分页目录。 */
  list(query?: Req.Models.ModelListParams, options?: CloudRequestOptions): Promise<Rsp.Models.AvailableModelPage>;
}

/** 创建普通渠道模型目录接口。 */
export function createModelsApi(http: HttpClient): ModelsApi {
  return {
    list: (query, options) =>
      http.request<Rsp.Models.AvailableModelPage>({
        method: 'GET',
        path: 'models',
        params: { offset: query?.offset, limit: query?.limit },
        requiresAccessToken: true,
        options,
      }),
  };
}
