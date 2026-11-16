# Proposal

## Why

指尖检测已有随包语音与单路播放机制，血压检测仍缺少随双阶段流程推进的声音指导。用户已确认血压文案、重新覆盖后再次播报贴胸指导，并提供六条新录音，需要同时接入血压语音、替换指尖三条旧录音和整理两者共用资源。

## What Changes

- 为 Android 原生血压检测接入放置、贴胸、正式开始、20／10 秒、最后三秒及完成、覆盖纠正、退回指尖后的重新覆盖和十五秒放置帮助语音；仅消费本轮真实快照及既有指导弹窗的可见性。
- 覆盖失效退回指尖阶段后，重新稳定并再次进入贴胸阶段时再次播报贴胸指导；重复快照、手动分页及 `starting → awaiting_chest` 不重播。
- 导入用户提供的六条新 MP3，替换指尖初始指导、正式开始和覆盖纠正录音。将现有四条共用录音一起迁移到 `assets/audio/common/`，同步静态导入与实测时长，移除项目内失效旧资源，不保留重复副本。
- 提取现有播放器与音频模式设置供两种方式复用，保留各自调度器及轮次隔离。关键节点可抢占旧指导，后台、离页或提前中断立即停声，实际正常到点后的合并结束语沿用指尖语义。
- 同步检测语音文档与既有规格中的旧文案、指尖专属生命周期描述和“血压不播放语音”限制；不改变页面提示、引导跳过偏好、原生覆盖／IMU 准入、正式时长或文件完成屏障。

## Capabilities

### New Capabilities

无；扩展现有原生检测页面能力，不新增近义能力目录。

### Modified Capabilities

- `native-measurement-pages`：新增血压阶段语音及重复贴胸指导规则，更新指尖录音文案，并将定时提示、覆盖纠正、帮助、结束衔接与轮次生命周期契约明确覆盖指尖和血压两种接触式检测。

## Impact

- 资源：`apps/native/assets/audio/` 下的共用、指尖与血压 MP3；下载源仅作为实施时的导入输入，不作为应用运行时依赖。
- 实现：`apps/native/src/app/measurement/fingertipVoice*` 的播放底座、资源表与类型，新增血压资源表及 `BloodPressureMeasurement/bloodPressureVoice.ts`，接入 `useBloodPressureMeasurement.ts`；同步受改名影响的指尖调用方与测试导入。
- 复用 `useContactMeasurementSession.ts` 已有取消／释放扩展点和 `BloodPressureSnapshot`，不新增 Nitro／Kotlin 接口、采样字段、依赖或权限。
- 验证仅覆盖语音核心流程、阶段往返、异步取消及正常结束／提前中断的区别，并进行常规 Android 页面实际播放检查；不扩大为医学、信号质量、压力或多设备验证。
- 长期说明更新 `docs/development/measurement.md` 与 `docs/development/frontend-development.md`，不修改 Web Demo，不新增血压数值、贴胸成功播报、上传或历史能力。
