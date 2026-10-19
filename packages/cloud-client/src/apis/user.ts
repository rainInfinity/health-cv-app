/** 实现本人账号资源的单次请求方法。 */

import type { CloudRequestOptions } from '../index';
import type { HttpClient } from '../http/client';
import type { Req, Rsp } from '../types';

/** 本人账号接口。 */
export interface UsersApi {
  /** 读取当前认证账号；Access Token 由外部认证状态提供。 */
  getMe(options?: CloudRequestOptions): Promise<Rsp.Users.UserAccount>;
  /** 读取本人健康资料，不转换后端字段或时间语义。 */
  getProfile(options?: CloudRequestOptions): Promise<Rsp.Users.MyProfile>;
  /** 仅提交调用方提供的本人资料字段。 */
  updateProfile(
    profile: Req.Users.ProfilePatchRequest,
    options?: CloudRequestOptions,
  ): Promise<Rsp.Users.MyProfile>;
}

/** 只复制资料 PATCH 的允许字段，并保持缺席、null 和 false 的差异。 */
function pickProfilePatch(profile: Req.Users.ProfilePatchRequest): Req.Users.ProfilePatchRequest {
  const patch: Req.Users.ProfilePatchRequest = {};
  if (Object.prototype.hasOwnProperty.call(profile, 'name') && profile.name !== undefined) {
    patch.name = profile.name;
  }
  if (Object.prototype.hasOwnProperty.call(profile, 'gender') && profile.gender !== undefined) {
    patch.gender = profile.gender;
  }
  if (Object.prototype.hasOwnProperty.call(profile, 'birthDate') && profile.birthDate !== undefined) {
    patch.birthDate = profile.birthDate;
  }
  if (Object.prototype.hasOwnProperty.call(profile, 'heightCm') && profile.heightCm !== undefined) {
    patch.heightCm = profile.heightCm;
  }
  if (Object.prototype.hasOwnProperty.call(profile, 'weightKg') && profile.weightKg !== undefined) {
    patch.weightKg = profile.weightKg;
  }
  if (Object.prototype.hasOwnProperty.call(profile, 'medicalHistory') && profile.medicalHistory !== undefined) {
    patch.medicalHistory = profile.medicalHistory;
  }
  if (Object.prototype.hasOwnProperty.call(profile, 'historyJson') && profile.historyJson !== undefined) {
    if (profile.historyJson === null) {
      patch.historyJson = null;
    } else {
      const history: Req.Users.StructuredHistoryPatch = {};
      if (
        Object.prototype.hasOwnProperty.call(profile.historyJson, 'isDiabetic') &&
        profile.historyJson.isDiabetic !== undefined
      ) {
        history.isDiabetic = profile.historyJson.isDiabetic;
      }
      if (
        Object.prototype.hasOwnProperty.call(profile.historyJson, 'isHypertensive') &&
        profile.historyJson.isHypertensive !== undefined
      ) {
        history.isHypertensive = profile.historyJson.isHypertensive;
      }
      patch.historyJson = history;
    }
  }

  return patch;
}

/** 创建本人账号资源接口。 */
export function createUsersApi(http: HttpClient): UsersApi {
  return {
    getMe: (options) =>
      http.request<Rsp.Users.UserAccount>({
        method: 'GET',
        path: 'users/me',
        requiresAccessToken: true,
        options,
      }),
    getProfile: (options) =>
      http.request<Rsp.Users.MyProfile>({
        method: 'GET',
        path: 'users/me/profile',
        requiresAccessToken: true,
        options,
      }),
    updateProfile: (profile, options) =>
      http.request<Rsp.Users.MyProfile>({
        method: 'PATCH',
        path: 'users/me/profile',
        data: pickProfilePatch(profile),
        requiresAccessToken: true,
        options,
      }),
  };
}
