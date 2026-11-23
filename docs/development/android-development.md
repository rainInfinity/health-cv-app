# Android 开发手册

## 工具与工程前提

- 使用 Node.js 24、仓库指定的 `pnpm@11.22.0`、JDK 17，以及 Android Studio／SDK Command-line Tools、Platform Tools、Emulator。配置 `JAVA_HOME`、`ANDROID_HOME`；若同时设置 `ANDROID_SDK_ROOT`，应指向同一 SDK。将 `platform-tools` 和 `emulator` 加入 `PATH`。
- 安装生成宿主所需的 Android SDK Platform、Build Tools、NDK／CMake，具体版本以 Expo／React Native 的 Gradle 配置为准，不用全局 Gradle 替代工程 wrapper。
- 真机开启 USB 调试并确认授权；模拟器先在 Device Manager 创建并启动 AVD。用 `adb devices -l` 确认目标为 `device`，多设备时为 ADB 命令加 `-s <device-serial>`。
- 原生采集必须使用 development build 或内部 Release，不能使用 Expo Go。Debug development build 需要 Metro；Release 包含 JS bundle，不依赖 Metro。
- 精确依赖版本以 `pnpm-lock.yaml` 为准。升级 Expo／React Native 时同时检查 `pnpm-workspace.yaml` 的固定版本补丁；不能只按 CLI 推荐修改一个 patch 版本。`styled-components/native` 还直接依赖 `css-to-react-native`，缺失会使 Metro 打包失败。

## CNG、Nitrogen 与构建

### 首次 Dev 构建

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/native exec expo prebuild --platform android
pnpm --filter @health-cv-app/native run android
```

`android` 脚本先生成采集包 Nitrogen 绑定，再调用 Expo `run:android` 构建、安装并启动 development build。修改原生依赖、Nitro Spec 或原生实现后需重建 APK，单独刷新 Metro 不会更新原生代码。

CNG 生成目录为 `apps/native/android`；需要彻底重建时使用 `pnpm --dir apps/native exec expo prebuild --platform android --clean`，它会删除并重建整个目录。宿主配置应维护在 `apps/native/app.json` 和 Expo config plugin 中，不把生成目录的手工改动当作唯一配置来源。

`packages/acquisition/nitrogen/generated/` 被 Git 忽略。直接从 Android Studio 同步／构建或手动运行 Gradle 前，先在根目录执行：

```sh
pnpm --filter @health-cv-app/acquisition run nitrogen
```

Gradle／CMake 配置阶段会加载生成文件，但绕过项目脚本不会自动运行 Nitrogen；Expo prebuild 也不替代绑定生成。

### 内部 Release

宿主已生成后，在根目录执行：

```sh
pnpm --filter @health-cv-app/native run android:release
adb -s <device-serial> install -r apps/native/android/app/build/outputs/apk/release/app-release.apk
```

脚本生成 Nitrogen 绑定后执行 `assembleRelease`，APK 路径如上。Release bundle 跟踪 `.env`、`.env.local`、`.env.production`、`.env.production.local`；脚本清除 Gradle 子进程的 `CI`，使用一次性 daemon。环境文件改变后重新构建，不能只重装旧 APK。

当前 Release 与 Debug 都使用 `debug.keystore`，仅供内部安装，不是正式发布签名。相同签名覆盖安装可保留数据；不要为解决连接问题随意卸载、清数据或清除 AVD 用户数据，以免丢失应用专属外部目录及已有内部目录中的采集文件。

## Metro、ADB 与连接排错

原生依赖未变化且 development build 已安装时，在 `apps/native` 启动 Metro：

```sh
env -u CI NODE_OPTIONS=--dns-result-order=ipv4first pnpm expo start --dev-client --localhost --port 8081
```

交互终端按 `a` 打开 Android。清除继承的 `CI=true` 可恢复终端交互；IPv4 优先与 ADB 反向转发可避免客户端访问不可达的虚拟网卡地址。无法传递快捷键或 Expo CLI 自动解析 deep link 失败时，按 CLI 当前链接手动打开，默认端口示例为：

```sh
adb -s <device-serial> reverse tcp:8081 tcp:8081
adb -s <device-serial> shell am start -W -a android.intent.action.VIEW \
  -d 'exp+health-cv-app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.healthcvapp.mobile
```

- **端口冲突／旧服务：** `run:android` 可能因 8081 占用而跳过 Metro，客户端仍连接旧服务器。另开终端选 8082，并将 Metro 的 `--port`、`adb reverse tcp:8082 tcp:8082` 及链接里的端口全部改为 8082。
- **连接状态：** 先检查 `adb devices -l` 与 `adb -s <device-serial> reverse --list`。APK 构建完成不等于 JS 项目已加载。
- **手动唤起：** 可用 `adb -s <device-serial> shell monkey -p com.healthcvapp.mobile 1` 打开已安装应用；Debug 仍需在开发客户端连接 Metro。
- **Maven 网络：** `apps/native/plugins/with-aliyun-gradle-repositories.js` 与 `patches/` 为 included build、插件及子项目依赖添加 Aliyun 前置镜像，官方仓库作为后备。Google Maven 可访问时镜像配置也仍生效；排查依赖下载时应同时检查网络、镜像和锁定补丁，而非只改生成宿主。
- **业务深链：** `healthcvapp://passive-capture` 指向开发栈的被动页，不启用服务。Expo Development Client 冷启动会先进入开发启动器，连接 Metro 时原 URL 可能丢失，不能替代独立 Release 的冷启动检查；运行中暖链接与冷启动分开处理。

## 现行入口与最短操作

启动入口是 `RootNavigator` 的 `Startup`，随后按引导状态进入产品流程，不是默认采集页。产品 Tab 与开发子栈定义在 `apps/native/src/app/navigation/`，调试页面位于 `apps/native/src/pages/dev/`。“开发”首页是“验证入口”，本地采集不要求登录、服务地址或渠道。

| 入口 | 操作与边界 |
| --- | --- |
| “功能”→“面部检测／面部心率”→准备与声音确认→面部心率检测 | 已选择“以后不再提示”时直接进入检测页，不显示准备页或声音提醒。真实原生 RPPG 进入保持 `--`、00:00 和空曲线；明确开始后才授权、挂载预览并打开／开始会话。平均只使用有效频谱窗，逐搏初步值不填入平均；不写入首页或健康历史。 |
| 产品“指尖检测” | 明确进入后授权并准备后摄与补光，真实覆盖稳定后自动正式采集三十秒；只展示本轮脉搏，不产生健康指标。返回等待本轮完整关闭，不停止其他所有者。 |
| “开发”→“验证入口”→“面部脉搏” | `RPPGScreen`：显式授权→打开前摄预览→开始人脸观察→等待正式测量结束或停止→刷新本地产物。 |
| “开发”→“验证入口”→“主动” | `AcquisitionScreen`：原生相机 PPG 的配置、分块与双 CSV 操作，不等同于产品指尖页。 |
| “开发”→“验证入口”→“被动 RPPG” | `PassiveCaptureScreen`：保存周期／正式时长→确认后台设置并授权启用→真实解锁→查询 RPPG 结果；历史视频单列查询。 |
| “开发”→“验证入口”→“传感” | `SensorCaptureScreen`：查看四种能力→输入整数微秒间隔→按类型开始→停止并保存。 |

### 主动 RPPG

进入 Dev 页面不申请相机权限或打开相机，纵向列表可滚动到操作区。依次点击“显式请求相机权限”“打开前摄预览”“开始人脸观察”；就绪条件连续满足后才正式计时。预览 host 布局完成不代表 CameraX 已开始输出图像。

测量可自动结束或用“停止并完成本地产物”提前收尾；刷新本地产物读取完整发布引用。无有效心率时保留空值和拒绝原因，不解释为 0 bpm。逐搏初步值与频谱平均独立；6–10 秒仅为体验目标，不保证出值。协议、算法和文件 schema 统一见 [Android RPPG 采集说明](../acquisition/android-rppg.md)。

产品与 Dev 主动页离开前均等待在途命令、相机／模型关闭和文件收尾；关闭失败应保留错误而非假报离开成功。已关闭客户端不复用，Dev 回页创建新 runtime。`PreviewView` 使用 PERFORMANCE／SurfaceView 时，关闭再打开应同时观察预览与分析帧恢复，不能只看页面状态。

Dev 共享按钮暴露文字名称与禁用／忙碌状态，进度有 `progressbar` 数值，错误有 alert 语义，波形有图片标签；相机预览不作为辅助技术图像暴露。操作时依赖文字状态而非颜色，TalkBack 顺序与最新 UI 的实际可用性需单独检查。

### 原生相机 PPG

1. 显式请求相机权限，枚举并选择 camera ID；枚举／查询不打开相机或创建会话。
2. 输入 Preview + YUV 候选宽高（px）与目标 FPS，查询所选相机能力和组合。改相机、尺寸或 FPS 后重新查询；`unknown` 不等于支持，也不等于明确不支持。
3. 按能力填写曝光时间（ns）、ISO、自动曝光补偿索引、白平衡、对焦距离（屈光度）、torch 及 `[rows, columns]` 网格。补偿 EV 为索引乘设备步长；不要把 EV 值直接当索引。
4. 打开已选配置，核对冻结请求／提交配置、调整项、实际几何／观测 FPS 和锁状态，再开始采集；停止并保存后关闭相机。打开周期内不能编辑配置，改变参数须关闭重开。
5. 核查单块 `[1,1]`、上下条带 `[N,1]`、左右条带 `[1,N]` 或非方形 `[2,3]` 时，PPG 每帧行数为块数，frame 文件每帧一行；按精确 `timestampFrame` 配对，不能按两个文件行号比较。

权限拒绝场景可先执行 `adb -s <device-serial> shell pm revoke com.healthcvapp.mobile android.permission.CAMERA`，再在应用中显式请求并拒绝；需要恢复时由用户在系统设置或授权界面处理。详细配置、锁定／解锁失败和文件协议见 [相机 PPG 协议](../acquisition/android-ppg.md)。

### 被动 RPPG

进入页面只读快照和本地结果，离页不停止服务。`intervalSeconds` 在Debug默认30秒，Release默认600秒；`measurementDurationSeconds` 默认12秒，观察上限默认5秒；主动仍30秒，两种方式共用3秒频谱窗与1秒步长，SNR门槛保持3 dB。完整频谱首窗理想连续输入约需6.5秒，短时长或输入断段不保证有结果。

明确点击“授权并启用无扰采集”，按系统界面处理 `CAMERA`、`POST_NOTIFICATIONS` 与“无扰式采集状态”渠道。厂商后台设置不能自动授予；Honor 等机型按页面引导手动设置，不把该设置当作通用 Android 权限。

服务等待时相机关闭；真实解锁且周期满足时才启动无预览分析。模拟器可使用真实系统输入，不伪造 `USER_PRESENT` 广播：

```sh
adb -s <device-serial> shell input keyevent 223
adb -s <device-serial> shell input keyevent 224
adb -s <device-serial> shell input keyevent 82
```

若keyguard未解除，需在模拟器窗口手动上滑／解锁。短周期只用于操作检查，不能替代600秒发布周期。通知“关闭无扰采集”停止服务；系统停止或进程重启后需重新启用。开发页“被动RPPG心率历史”按最新会话在前展示最近20条：本轮有效频谱窗口均值、有效／总窗口数、冻结配置和时长；可展开逐搏序列，读取相对首帧时间、bpm及RR。旧记录无逐搏历史会明确说明；无有效窗口显示 `--`。新v2结果包含 `session.json/pulse.csv/hr.csv/beat.csv`，旧三件套与视频仍可查询，不重算或删除；文件schema见[被动采集协议](../acquisition/android-passive-capture.md)。

### 传感器与模拟器输入

按类型输入 5,000–1,000,000 μs 的整数间隔并开始／停止；请求／注册间隔不等于稳定实际采样频率。同类型只允许一个会话，不同类型可并行。切页只解除 UI 订阅，宿主进入后台会中断传感器；返回前台需手动重新开始。

模拟器可向系统传感器输入非零值，数据仍由 Android `SensorManager` 回调进入原生队列：

```sh
adb -s <device-serial> emu sensor set acceleration 1.25:2.5:3.75
adb -s <device-serial> emu sensor set gyroscope 4.5:5.5:6.5
adb -s <device-serial> emu sensor set magnetic-field 7.25:8.25:9.25
```

重力传感器是否可用及其派生输出以 AVD 设备为准，不把上面的加速度输入直接当成重力期望值。字段、单位、坐标系、失败与资源边界见 [传感器采集协议](../acquisition/android-sensors.md)。

## 采集文件与资源核查

新采集产物位于 `getExternalFilesDir(null)` 下，当前包名通常对应 `/sdcard/Android/data/com.healthcvapp.mobile/files/`。设备允许时可直接用 ADB 读取和拉取，不需要 root、`run-as` 或 debuggable 构建，也不新增存储权限。该目录不是公共目录，普通应用及文件管理器访问仍受系统限制，卸载应用仍会删除其中的文件。外部根目录不可用时明确失败，不回退内部目录。不要在运行中的缓冲文件暂不可读时断言没有采样。

以下传感器命令中的 `<kind>` 替换为 `accelerometer`、`gyroscope`、`magnetometer` 或 `gravity`。

```sh
adb -s <device-serial> shell find /sdcard/Android/data/com.healthcvapp.mobile/files/acquisition -type f -print
adb -s <device-serial> shell cat '/sdcard/Android/data/com.healthcvapp.mobile/files/acquisition/ppg/<sessionId>/ppg.csv'
adb -s <device-serial> shell cat '/sdcard/Android/data/com.healthcvapp.mobile/files/acquisition/ppg/<sessionId>/frame.csv'
adb -s <device-serial> shell cat '/sdcard/Android/data/com.healthcvapp.mobile/files/acquisition/rppg/<sessionId>/session.json'
adb -s <device-serial> shell wc -l '/sdcard/Android/data/com.healthcvapp.mobile/files/acquisition/rppg/<sessionId>/pulse.csv' '/sdcard/Android/data/com.healthcvapp.mobile/files/acquisition/rppg/<sessionId>/hr.csv'
adb -s <device-serial> shell cat '/sdcard/Android/data/com.healthcvapp.mobile/files/acquisition/rppg/<sessionId>/beat.csv'
adb -s <device-serial> shell find '/sdcard/Android/data/com.healthcvapp.mobile/files/acquisition/<kind>' -type f -print
adb -s <device-serial> pull /sdcard/Android/data/com.healthcvapp.mobile/files/acquisition ./acquisition
```

已有内部文件不搬移、不删除；RPPG 查询合并内外两处完整结果，历史视频继续使用内部目录。以下旧路径读取命令仅适用于可调试构建的 `run-as`；普通非 debuggable Release 不能据此直接读取内部文件，不用 root 绕过应用边界：

```sh
adb -s <device-serial> shell run-as com.healthcvapp.mobile find files/acquisition -type f -print
adb -s <device-serial> shell run-as com.healthcvapp.mobile cat 'files/acquisition/<sessionId>/ppg.csv'
adb -s <device-serial> shell run-as com.healthcvapp.mobile cat 'files/acquisition/<sessionId>/frame.csv'
adb -s <device-serial> shell run-as com.healthcvapp.mobile cat 'files/acquisition/rppg/<sessionId>/session.json'
adb -s <device-serial> shell run-as com.healthcvapp.mobile wc -l 'files/acquisition/rppg/<sessionId>/pulse.csv' 'files/acquisition/rppg/<sessionId>/hr.csv'
adb -s <device-serial> shell run-as com.healthcvapp.mobile find files/acquisition/sensors -type f -print
adb -s <device-serial> shell run-as com.healthcvapp.mobile find files/passive-capture -name video.mp4 -print
adb -s <device-serial> shell dumpsys media.camera
adb -s <device-serial> shell dumpsys sensorservice
adb -s <device-serial> shell dumpsys activity services com.healthcvapp.mobile/com.healthcvapp.acquisition.passive.service.PassiveCaptureService
```

- **PPG：** 新完成目录为外部根目录下的 `acquisition/ppg/<sessionId>/`，双 CSV 均关闭并提升才是完成产物；按帧分组核对块编号与精确传感器时间戳。
- **RPPG：** 按 [统一文件 schema](../acquisition/android-rppg.md#文件-schema-与完整发布) 核查完整标记、来源、终止／信号结论、配置／相机摘要和计数。合法中断含 `interrupted`，不等于技术失败；无有效心率不是准确率结论。
- **传感器：** 外部根目录下的 `acquisition/<kind>/<sessionId>/<kind>.csv` 至少有一条样本才完成；`.part` 不属于完成产物。
- **历史视频：** `files/passive-capture/<sessionId>/video.mp4` 不转换为新 RPPG，不作为新会话结果。
- **查询寿命：** PPG／传感器列表仅维护当前进程完成引用，重启后列表重置但文件仍保留；RPPG 查询扫描外部新结果与已有内部结果的已发布最终目录。各类临时文件都不能冒充完成文件，也没有通用自动清理承诺。
- **资源：** 主动页离开后检查相机释放；被动服务等待时不应占相机。传感器与被动服务有独立生命周期，不能要求主动相机关闭就同时停止其他源。

## MCD 模拟器人脸素材

### 来源、许可与缓存

素材为 MCD-rPPG 的 `1020_FullHDwebcam_before`，来源是[作者仓库](https://github.com/ksyegorov/mcd_rppg)链接的[数据集页面](https://huggingface.co/datasets/kyegorov/mcd_rppg)，数据卡标注 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。使用时保留作者、来源、许可和修改说明。人脸与健康数据有隐私风险，不用于身份识别，不把调试结果解释为临床结论。

缓存位于项目外 `~/Library/Caches/health-cv-app/rppg-fixtures/mcd-rppg/`，不提交 Git、不打包进 APK，也不在应用运行时下载。参考信号与元数据远端同名，本地增加后缀防止覆盖：

| 本地文件 | 数据集路径 |
| --- | --- |
| `1020_FullHDwebcam_before.avi` | `video/1020_FullHDwebcam_before.avi` |
| `1020_FullHDwebcam_before.ppg_sync.txt` | `ppg_sync/1020_FullHDwebcam_before.txt` |
| `1020_FullHDwebcam_before.meta.txt` | `meta/1020_FullHDwebcam_before.txt` |

首次获取或缓存被清理后，在宿主执行；命令会覆盖同名文件：

```sh
FIXTURE_DIR="$HOME/Library/Caches/health-cv-app/rppg-fixtures/mcd-rppg"
SOURCE="https://huggingface.co/datasets/kyegorov/mcd_rppg/resolve/main"
mkdir -p "$FIXTURE_DIR"
curl --fail --location --retry 2 "$SOURCE/video/1020_FullHDwebcam_before.avi" \
  --output "$FIXTURE_DIR/1020_FullHDwebcam_before.avi"
curl --fail --location --retry 2 "$SOURCE/ppg_sync/1020_FullHDwebcam_before.txt" \
  --output "$FIXTURE_DIR/1020_FullHDwebcam_before.ppg_sync.txt"
curl --fail --location --retry 2 "$SOURCE/meta/1020_FullHDwebcam_before.txt" \
  --output "$FIXTURE_DIR/1020_FullHDwebcam_before.meta.txt"
shasum -a 256 "$FIXTURE_DIR/1020_FullHDwebcam_before."*
```

以下为固定素材身份元数据，缓存重建后据此校验，不表示某次下载或采集验收结果：

| 本地文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `1020_FullHDwebcam_before.avi` | 81526784 | `b17e07cb9c56b771ad8ff3668fd78790f4732b2e63557a803ee40dfebd4b1592` |
| `1020_FullHDwebcam_before.ppg_sync.txt` | 64191 | `6d23ac6be31ba2d5edb13189a3df03e3edf691200da9559c00e08aeabeda6ce5` |
| `1020_FullHDwebcam_before.meta.txt` | 182459 | `3b9bf46bc854657ae39cc3007ce0052ee44890de8fe19b842628ae99a193c215` |

### 变换与模拟器前摄输入

原文件是 640 × 480 的 MPEG-4／YUV420P AVI。供模拟器输入的 `1020_FullHDwebcam_before-center80-h264.mp4` 使用如下变换：逐帧解码，从 `x=0,y=48` 裁取 512 × 432，缩放至 640 × 480，以 H.264／YUV420P 编码并保留原始帧 PTS。该变体仅扩大人脸在画面中的占比，不重采样帧率、不拼接或循环，不用于信号精度比较；重建时需自行准备视频转码工具，如 PyAV。未裁剪的 H.264 版本与该裁剪版本不能混用为同一输入。

先正常关闭同名 AVD，再从宿主启动可见窗口；不使用 `-no-window`，不清除用户数据：

```sh
FIXTURE_DIR="$HOME/Library/Caches/health-cv-app/rppg-fixtures/mcd-rppg"
emulator -list-avds
emulator -help-camera-front
emulator -avd <AVD名称> \
  -camera-front "videofile:$FIXTURE_DIR/1020_FullHDwebcam_before-center80-h264.mp4" \
  -no-snapshot-load
```

先用本机 Emulator 帮助确认支持 `videofile:<filename>`。应用只接收模拟器通过 CameraX 提供的帧，不直接读取宿主视频文件；请求尺寸／FPS 与实际交付不相同。画面方向、裁剪、播放结束行为及时间轴应按当前 AVD 检查，不能外推到其他模拟器或真机。后摄也可使用 `videofile:`，见下节；虚拟场景本身不代表指尖生理信号。

同步参考 PPG 和采集元数据仅能在建立明确时间映射后用于对照。模拟器墙钟不能直接匹配原始参考信号；解码、相机重采样与丢帧都可能改变对应关系。

## 指尖录制素材与后摄回放

用户自行录制的 `VID_20261114_233643.mp4` 位于工作区根目录，供本地验证，不提交 Git、不打包进 APK。视频编码为 H.264，编码尺寸 1280×720、显示旋转 90°，显示尺寸为 720×1280，时长约四十秒；含未覆盖到覆盖的变化，不把未录到的状态视为已覆盖的测试输入。音轨不参与算法。

从仓库根目录执行，先正常关闭同名 AVD，不清除用户数据：

```sh
VIDEO="$PWD/VID_20261114_233643.mp4"
emulator -help-camera-back
emulator -avd <AVD名称> \
  -camera-back "videofile:$VIDEO" \
  -no-snapshot-load -no-snapshot-save
```

系统相机切至后摄可检查输入画面；产品流程仍必须检查真实查询到的后摄能力。补光明确支持时开启，不支持或未知时继续无补光预览及真实覆盖观测，不增加产品模拟开关，不因视频回放放宽覆盖门控。离线算法检查可解码视频，将保留呈现时间的 YUV 像素交给同一覆盖／脉搏处理器；不能用文件是否存在或预设正弦信号代替该检查。

回放从素材起点开始，核对旋转、中心裁剪、实际帧率、播放结束及循环行为。视频时间不等于模拟器相机时间；不能用模拟器元数据还原录像设备的曝光或锁定事实，也不能把循环边界拼成连续人体采样。压缩及原相机图像处理可能削弱颜色和脉动，需如实检查当前固定红色展示通道是否有可用动态，不能生成替代波形，也不能把通道变化本身认定为人体脉搏。录制回放不替代最终真实设备的覆盖校准、补光／锁定、生命周期及人体脉搏展示验证。


## ECharts 脉搏波依赖

产品脉搏波使用 ECharts 6.0.0、`@wuba/react-native-echarts` 3.1.1、zrender 6.0.0 和已有 SVG 15.15.4。`pnpm-workspace.yaml` 仅将 ECharts／zrender 的 `tslib` 依赖固定为 2.8.1，避免旧版本导出导致 Metro 启动错误，不覆盖其他依赖的解析。

## 待真机验证的限制

文档描述现行接口与操作，不记录历史验收结论。模拟器、合成输入、模型推理、文件存在和初步 bpm 均不能代替人体或实体设备验证。

- 记录机型／厂商、Android／API、应用版本／target SDK、权限与通知渠道、后台设置，分别检查主动相机、被动前台服务和传感器的生命周期。
- 在不同肤色／照明下检查当前 `BT601_LIMITED_V1` 颜色假设、曝光、覆盖提示与对焦；记录实际 FPS、模型延迟、流畅度、温升、耗电和持续运行表现。
- 被动服务需实际检查发布默认10分钟等待、周期内解锁抑制、通知关闭、锁屏／系统停止及重启后不自动恢复；Debug默认30秒只用于本地测试，旧录像阶段行为不能代替当前RPPG验证。
- 用独立参考心率仪器同步采样并建立时间对齐，分别评估逐搏值、频谱有效窗与拒绝原因；6–10 秒不是保证，缺值不等于准确、有效读数也不等于医学有效。
- 检查有值／缺值布局、预览重开、窄屏与 TalkBack；产品面部真实路径、Dev 调试页和指尖真实采集分别检查，不能相互替代。

## 按需代码检查

在仓库根目录执行包级检查；这些命令不替代设备操作和文件核查：

```sh
pnpm --filter @health-cv-app/acquisition run nitrogen
pnpm --filter @health-cv-app/acquisition run typecheck
pnpm --filter @health-cv-app/native run typecheck
pnpm --filter @health-cv-app/cloud-client run typecheck
pnpm --filter @health-cv-app/native test
pnpm --filter @health-cv-app/cloud-client test
```

原生单元测试和 Debug APK 构建在 `apps/native/android` 执行；运行前须完成 Nitrogen 生成：

```sh
./gradlew --no-daemon :health-cv-app_acquisition:testDebugUnitTest :app:assembleDebug
```

Debug APK 位于 `apps/native/android/app/build/outputs/apk/debug/app-debug.apk`；需要安装到已连接目标时，可将 `:app:assembleDebug` 改为 `:app:installDebug`。
