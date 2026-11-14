/** 将主动 RPPG 页的离页保护接入外部导航目标。 */

type LeaveRequest = (continueNavigation: () => void) => void

let focusedRPPGLeaveRequest: LeaveRequest | null = null

/** 注册当前聚焦的主动 RPPG 页离页协调器。 */
export function registerRPPGLeaveRequest(request: LeaveRequest): () => void {
  focusedRPPGLeaveRequest = request
  return () => {
    if (focusedRPPGLeaveRequest === request) focusedRPPGLeaveRequest = null
  }
}

/** 等待 RPPG 资源安全交接后继续外部导航。 */
export function requestRPPGLeave(continueNavigation: () => void): boolean {
  const request = focusedRPPGLeaveRequest
  if (request == null) return false
  request(continueNavigation)
  return true
}
