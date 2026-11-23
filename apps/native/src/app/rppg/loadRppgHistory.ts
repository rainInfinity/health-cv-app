/** 从已发布产物引用有限读取历史，不把本地路径交给页面处理。 */
import type { RPPGArtifact } from '@health-cv-app/acquisition'
import { FileSystem } from 'react-native-file-access'
import { parseRPPGHistory, type RPPGHistory } from './rppgHistory'

/** 单文件最大512 KiB；超限不截断为完整历史。 */
const MAX_HISTORY_FILE_BYTES = 512 * 1024

/** 读取实际已发布小文件，不读取整轮脉搏波或猜测文件路径。 */
export async function loadRPPGHistory(artifact: RPPGArtifact): Promise<RPPGHistory> {
  /** 对实际文件大小和引用大小都设限，避免把任意 CSV 读入页面。 */
  async function readFile(kind: string, optional = false): Promise<string | null> {
    const file = artifact.files.find((item) => item.kind === kind)
    if (file == null) {
      if (optional) return null
      throw new Error('RPPG_HISTORY_MISSING_FILE')
    }
    const stat = await FileSystem.stat(file.path)
    if (file.sizeBytes > MAX_HISTORY_FILE_BYTES || Number(stat.size) > MAX_HISTORY_FILE_BYTES) {
      throw new Error('RPPG_HISTORY_FILE_TOO_LARGE')
    }
    return FileSystem.readFile(file.path, 'utf8')
  }
  const [session, windows, beats] = await Promise.all([
    readFile('session'), readFile('heart-rate'), readFile('instant-heart-rate', true),
  ])
  return parseRPPGHistory(artifact, session!, windows!, beats)
}
