/** 将主动采集页的离页保护接入外部导航目标。 */

type LeaveRequest = (continueNavigation: () => void) => void

let focusedAcquisitionLeaveRequest: LeaveRequest | null = null

/** 注册当前聚焦的主动采集页离页协调器。 */
export function registerAcquisitionLeaveRequest(request: LeaveRequest): () => void {
  focusedAcquisitionLeaveRequest = request
  return () => {
    if (focusedAcquisitionLeaveRequest === request) focusedAcquisitionLeaveRequest = null
  }
}

/** 在主动采集页完成资源交接后继续外部导航。 */
export function requestAcquisitionLeave(continueNavigation: () => void): boolean {
  const request = focusedAcquisitionLeaveRequest
  if (request == null) return false
  request(continueNavigation)
  return true
}
