/** 定义后端 JSON 响应包装的边界字段。 */

/** 后端 API 响应包装；业务方法随后只向调用方返回 `data`。 */
export interface ApiResponse<TData> {
  /** 后端业务结果码。 */
  code: string;
  /** 后端安全提示，可缺席。 */
  message?: string;
  /** 业务数据；允许按具体接口为 `null`。 */
  data: TData;
  /** 后端请求标识，可由响应头补充。 */
  requestId?: string;
}

