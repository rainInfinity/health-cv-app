/** 实现普通渠道任务的单次请求方法。 */

import type { CloudRequestOptions } from '../index';
import type { HttpClient } from '../http/client';
import type { Req, Rsp } from '../types';

/** 保留已有 URI scheme，只为裸本地路径补一次 file URI 前缀。 */
function normalizeFileUri(uri: string): string {
  const value = uri;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return value;
  }

  return `file://${value.startsWith('/') ? '' : '/'}${value}`;
}
/** 将点段和保留字符编码为单一 URL 路径段。 */
function encodePathSegment(value: string): string {
  const encoded = encodeURIComponent(value);
  return encoded === '.' || encoded === '..'
    ? encoded.replace(/\./g, '%2E')
    : encoded;
}

/** 按 React Native 文件引用契约构造单文件 multipart 请求体。 */
function createUploadFormData(input: Req.Tasks.UploadTaskInputRequest): FormData {
  const formData = new FormData();
  formData.append('logicalName', input.logicalName);
  formData.append(
    'file',
    {
      uri: normalizeFileUri(input.file.uri),
      name: input.file.name,
      type: input.file.type,
    } as unknown as Blob,
  );
  return formData;
}

/** 普通渠道任务接口；每个方法只调用一个后端端点。 */
export interface TasksApi {
  /** 为当前渠道配置的模型创建固定版本草稿。 */
  create(request: Req.Tasks.CreateTaskRequest, options?: CloudRequestOptions): Promise<Rsp.Tasks.TaskSummary>;
  /** 读取当前账号任务的倒序分页。 */
  list(query?: Req.Tasks.TaskListParams, options?: CloudRequestOptions): Promise<Rsp.Tasks.TaskPage>;
  /** 按任务主键读取摘要和详情。 */
  getById(taskId: number, options?: CloudRequestOptions): Promise<Rsp.Tasks.TaskDetail>;
  /** 提交草稿；可选附带客户端元数据，不传请求体也受支持。 */
  submit(
    taskId: number,
    request?: Req.Tasks.SubmitTaskRequest,
    options?: CloudRequestOptions,
  ): Promise<Rsp.Tasks.TaskSummary>;
  /** 上传一个任务输入文件并返回服务端登记元数据。 */
  uploadFile(
    taskId: number,
    input: Req.Tasks.UploadTaskInputRequest,
    options?: CloudRequestOptions,
  ): Promise<Rsp.Tasks.TaskInputFile>;
  /** 按上传回执中的 fileId 下载原始输入文件。 */
  downloadInput(taskId: number, fileId: number, options?: CloudRequestOptions): Promise<Rsp.Tasks.TaskFileDownload>;
  /** 按输出逻辑名下载成功任务生成的文件。 */
  downloadOutput(
    taskId: number,
    logicalName: string,
    options?: CloudRequestOptions,
  ): Promise<Rsp.Tasks.TaskFileDownload>;
}

/** 创建普通渠道任务接口。 */
export function createTasksApi(http: HttpClient): TasksApi {
  return {
    create: (request, options) =>
      http.request<Rsp.Tasks.TaskSummary>({
        method: 'POST',
        path: 'tasks',
        data: request,
        requiresAccessToken: true,
        options,
      }),
    list: (query, options) =>
      http.request<Rsp.Tasks.TaskPage>({
        method: 'GET',
        path: 'tasks',
        params: { offset: query?.offset, limit: query?.limit },
        requiresAccessToken: true,
        options,
      }),
    getById: (taskId, options) =>
      http.request<Rsp.Tasks.TaskDetail>({
        method: 'GET',
        path: `tasks/${taskId}`,
        requiresAccessToken: true,
        options,
      }),
    submit: (taskId, request, options) =>
      http.request<Rsp.Tasks.TaskSummary>({
        method: 'POST',
        path: `tasks/${taskId}/submit`,
        data: request,
        requiresAccessToken: true,
        options,
      }),
    uploadFile: (taskId, input, options) =>
      http.request<Rsp.Tasks.TaskInputFile>({
        method: 'POST',
        path: `tasks/${taskId}/files`,
        data: createUploadFormData(input),
        requiresAccessToken: true,
        options,
      }),
    downloadInput: (taskId, fileId, options) =>
      http.requestFile({
        path: `tasks/${taskId}/files/${fileId}/download`,
        requiresAccessToken: true,
        options,
      }),
    downloadOutput: (taskId, logicalName, options) =>
      http.requestFile({
        path: `tasks/${taskId}/outputs/${encodePathSegment(logicalName)}/download`,
        requiresAccessToken: true,
        options,
      }),
  };
}
