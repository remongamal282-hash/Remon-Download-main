# Remon Download — Prototype Specification

> **Status:** Final / Implementation Ready
> **Document Type:** Executable Specification for AI Coding Agent
> **Single Source of Truth:** `docs/SPEC.md`

هذه الوثيقة هي المرجع الرسمي الوحيد لمتطلبات مرحلة React Prototype. عند وجود تعارض بين هذه الوثيقة وأي محادثة أو ذاكرة سابقة، تُعتمد هذه الوثيقة.

## قواعد القراءة

| المصطلح | المعنى |
|---|---|
| **MUST / يجب** | إلزامي، لا يجوز تجاوزه أو تفسيره بحرية. |
| **MUST NOT / يُمنع** | ممنوع تمامًا في هذه المرحلة. |
| **SHOULD / يُفضّل** | موصى به بقوة؛ الانحراف يحتاج سببًا تقنيًا موثقًا في `docs/DECISIONS.md`. |
| **MAY / يجوز** | اختياري ضمن حدود الوثيقة. |

---

# 1. Project Overview

**Remon Download** تطبيق Desktop مستقل لتنزيل وإدارة فيديوهات YouTube: Video / Shorts / Playlist / Video inside Playlist / Channel.

هذه المرحلة هي **React Prototype / UI MVP** فقط. الهدف هو بناء واجهة كاملة وقابلة للتفاعل مع منطق Mock واقعي، تمهيدًا للانتقال لاحقًا إلى Electron + Node.js.

## 1.1 Visual Direction

التصميم MUST يكون:

- Clean
- Modern
- Professional
- Minimal
- Fast-looking
- مناسبًا لبرنامج Download Manager حقيقي، وليس موقع Web تقليدي.

العناصر الأساسية:

- Sidebar
- Top Bar
- Main Content
- Cards
- Tables / Lists
- Progress Indicators
- Toast Notifications عبر `sonner`
- Modal Dialogs
- Empty / Loading / Error States

---

# 2. Scope & Hard Constraints

## 2.1 Included

يجب بناء:

- React UI حقيقية وليست Static HTML.
- State Management حقيقي.
- Services كـ Interfaces + Mock Implementations.
- Mock Metadata Analysis.
- Mock Download Lifecycle.
- Mock Progress Simulation.
- Queue Management.
- History.
- Favorites.
- Scheduler UI.
- Settings Persistence.
- Arabic / English.
- RTL / LTR.
- Light / Dark / System.
- Error Simulation.
- Dev Tools.
- Accessibility.
- Tests.
- Documentation / AI Handoff.

## 2.2 Hard Constraints

في هذه المرحلة:

- **MUST NOT** استخدام Electron.
- **MUST NOT** بناء Backend حقيقي.
- **MUST NOT** استخدام `yt-dlp` فعليًا.
- **MUST NOT** استخدام `FFmpeg` فعليًا.
- **MUST NOT** استخدام SQLite.
- **MUST NOT** تنفيذ Real Downloads.
- **MUST NOT** تنفيذ OS Clipboard Integration.
- **MUST NOT** تنفيذ Windows Taskbar Integration.
- **MUST NOT** تنفيذ System Tray Integration.
- **MUST NOT** تنفيذ Native Windows APIs.
- **MUST NOT** إنشاء Login / Register / Account / Profile.
- **MUST NOT** إضافة Authentication.
- **MUST NOT** إضافة Cloud Account / Subscription / Payment.
- **MUST NOT** استخدام Redux.
- **MUST NOT** استخدام Context API لإدارة Global State.
- **MUST NOT** تغيير Stack الأساسي دون اتباع Section 33.
- **MUST NOT** حذف Feature أو Requirement من هذه الوثيقة دون موافقة المستخدم.

---

# 3. Goal

يجب أن يشعر المستخدم أنه يتعامل مع Download Manager حقيقي رغم أن كل العمليات الخارجية Mock.

نجاح المرحلة يعني أن:

- التحليل يعمل تفاعليًا.
- الفيديو المفرد يمكن إضافته للـ Queue.
- Playlists يمكن اختيار عناصرها وتنزيلها.
- Queue تعمل فعليًا.
- Progress يتحرك بشكل غير خطي.
- Pause / Resume / Cancel / Retry تعمل.
- History وFavorites تتحدث تلقائيًا.
- Scheduler يعمل كمحاكاة زمنية.
- Settings تحفظ نفسها.
- الأخطاء قابلة للمحاكاة.
- اللغة والثيم والاتجاه تعمل.
- Tests وBuild ينجحان.
- المشروع يمكن أن يستكمل بواسطة AI آخر من `docs/`.

---

# 4. Tech Stack

## 4.1 Required Stack

| Technology | Usage |
|---|---|
| React | UI |
| TypeScript | Type Safety |
| Vite | Build / Dev Server |
| Tailwind CSS | Styling |
| React Router | Routing |
| Zustand | Global State — حصريًا |
| Lucide React | Icons |

Node.js:

- Node.js **20 LTS** أو **22 LTS** فقط.
- `tsconfig.json` MUST يحتوي `"strict": true`.
- `any` MUST NOT يُستخدم إلا في حالة استثنائية موثقة بتعليق مباشر.

## 4.2 State Management

Zustand هو Global State Manager الوحيد.

MAY استخدام `useState` للحالات المحلية البسيطة جدًا.

MUST NOT استخدام:

- Redux
- MobX
- Recoil
- Context API كبديل للـ Global State
- أي State Management إضافي.

## 4.3 Approved Additional Libraries

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `sonner`
- `react-hook-form`
- `zod`
- `i18next`
- `react-i18next`
- `vitest`
- `@testing-library/react`
- `@testing-library/user-event`

MUST NOT إضافة مكتبات إضافية لمجرد Best Practice أو Trend.

`@tanstack/react-virtual` MAY تضاف مستقبلًا فقط عند وجود حاجة مثبتة بالأداء وتوثيق القرار.

`next-themes` و`immer` غير مطلوبين.

---

# 5. Architecture

## 5.1 Mandatory Layered Flow

```text
React Components
      ↓
Hooks / Zustand Stores
      ↓
Service Interfaces
      ↓
Mock Service Implementations
```

Components MUST NOT تستورد Mock Services مباشرة.

ممنوع:

```text
Component → MockService
```

مسموح:

```text
Component → Store / Hook → Service Interface → Mock Implementation
```

Components MUST NOT تعرف أي تفاصيل عن:

- yt-dlp
- FFmpeg
- Filesystem
- Electron
- OS APIs

## 5.2 Constants

استخدم `src/constants/` للقيم المهمة مثل:

- Routes
- Download statuses
- Concurrent Download Options
- Speed Limits
- Default Settings
- Format Options
- Quality Options

MUST NOT تكرار Magic Strings أو Magic Numbers المهمة.

## 5.3 Error Boundary

يجب وجود React Error Boundary عام على مستوى التطبيق مع Fallback UI بسيط.

Error Boundary خاص بأخطاء React Rendering، وليس بديلًا عن Service Error Handling.

## 5.4 Lazy Loading

React.lazy / Suspense ليسا Requirement إجباريًا. يجوز استخدامهما فقط إذا ظهرت حاجة تقنية واضحة ويتم توثيق القرار.

---

# 6. Project Structure

```text
src/
├── components/
├── pages/
├── layouts/
├── hooks/
├── stores/
├── services/
├── types/
├── utils/
├── constants/
├── i18n/
├── mock/
└── assets/

docs/
├── SPEC.md
├── ARCHITECTURE.md
├── DEVELOPMENT_STATUS.md
├── DECISIONS.md
├── CHANGELOG.md
├── KNOWN_ISSUES.md
└── AI_HANDOFF.md

README.md
.env.example
package.json
tsconfig.json
vite.config.ts
```

لا تُفرض `src/features/` إلا إذا أصبح Feature كبيرًا فعلًا، ويجب توثيق القرار.

## 6.1 Desktop Layout

الهدف الأساسي:

- 1280×720
- 1366×768
- 1920×1080

MUST NOT انهيار الواجهة ضمن هذه المقاسات.

---

# 7. Localization & Themes

## 7.1 Languages

يجب دعم:

- Arabic
- English

باستخدام `i18next` + `react-i18next`.

لا توجد نصوص UI Hardcoded داخل Components.

## 7.2 Direction

اتجاه الواجهة **يتبع اللغة المختارة تلقائيًا**:

- Arabic → RTL
- English → LTR

لا يوجد إعداد مستقل للاتجاه في Settings.

## 7.3 Directional Icons

فقط الأيقونات الاتجاهية مثل:

- Back
- Forward
- Previous
- Next
- Chevron directional

يجوز عكسها في RTL.

الأيقونات التالية لا تُعكس:

- Download
- Delete
- Settings
- Play
- Pause
- Stop
- Folder
- Search

إلا إذا ظهر سبب حقيقي.

## 7.4 Themes

يجب دعم:

- Light
- Dark
- System

بدون Theme Library إضافية.

`System` يتبع `prefers-color-scheme`.

---

# 8. Pages

يجب وجود الصفحات السبع:

1. Dashboard
2. Download Queue
3. History
4. Favorites
5. Scheduler
6. Settings
7. About

لا يجوز حذف أو دمج أي صفحة.

## 8.1 Suggested Routes

يمكن استخدام:

```text
/
/queue
/history
/favorites
/scheduler
/settings
/about
```

اختيار أسماء Routes الصغيرة القابلة للعكس متروك للـ AI، بشرط الحفاظ على الصفحات السبع.

---

# 9. Dashboard

## 9.1 Quick Add URL

حقل URL كبير باستخدام:

- `react-hook-form`
- `zod`

زر:

**Analyze**

بعد التحليل يتم عرض Mock Metadata.

## 9.2 URL Validation

يجب دعم:

| الحالة | السلوك |
|---|---|
| Empty | Validation Error |
| Invalid URL | Validation Error بدون Analyze |
| Valid non-YouTube URL | Unsupported URL |
| Valid YouTube URL | بدء التحليل |
| Analyzing | Analyze Disabled + Loading |
| Analyze أثناء Analyze قائم | ممنوع |

يجب اختبار كل الحالات.

## 9.3 Detected Link Type

يجب اكتشاف النوع Mock:

- Video
- Shorts
- Playlist
- Video inside Playlist
- Channel

ويظهر للمستخدم بوضوح.

مثال:

> تم اكتشاف فيديو داخل قائمة تشغيل — سيتم تحميل هذا الفيديو فقط.

## 9.4 Single Video / Shorts Action

بعد نجاح تحليل:

لـ:

- Video
- Shorts
- Video inside Playlist

يظهر زر:

**Add to Queue**

السلوك:

1. يأخذ الـ metadata الحالي.
2. ينشئ `DownloadItem`.
3. يضيفه إلى Queue عبر Zustand Store.
4. لا يبدأ Download تلقائيًا.
5. يظهر Toast نجاح.
6. يسمح للمستخدم بالانتقال إلى Queue.

لـ Video inside Playlist:

- **Add to Queue** يضيف الفيديو الحالي فقط.
- لا يضيف باقي Playlist.

## 9.5 Playlist

عند اكتشاف Playlist يجب عرض:

- Playlist Title
- Number of Videos
- Thumbnail
- Title
- Duration
- Checkbox

الأزرار:

- Select All
- Deselect All
- Download Selected
- Download Entire Playlist

`Download Selected` يضيف العناصر المحددة إلى Queue.

`Download Entire Playlist` يضيف كل العناصر إلى Queue.

لا يبدأ Download تلقائيًا؛ الإضافة للـ Queue هي السلوك الافتراضي.

## 9.6 Channel

عند اكتشاف Channel، لا يتم تنفيذ Channel-wide downloading في هذه المرحلة.

يجب عرض واجهة واضحة تحتوي على:

- Channel Name
- Channel Thumbnail
- Mock Video Count
- قائمة Mock بأحدث عدد محدود من الفيديوهات.
- Checkbox لكل فيديو.
- Select All / Deselect All.
- Add Selected to Queue.

الهدف هو استيفاء Mock Channel Analysis والـ Acceptance Criteria بدون بناء نظام Channel crawling حقيقي.

MUST NOT تنفيذ تحليل أو تحميل حقيقي للقناة.

## 9.7 Video Info

بعد التحليل يجب عرض:

- Resolution
- FPS
- Video Codec
- Audio Codec
- Video Bitrate
- Audio Bitrate
- Container
- File Size
- Upload Date
- Views

---

# 10. Download Queue

Queue يجب أن تكون تفاعلية بالكامل.

كل `DownloadItem` يحتوي على:

- Thumbnail
- Title
- Source URL
- Quality
- Format
- File Size
- Downloaded Size
- Speed
- ETA
- Progress
- Status
- Order
- Added At

الأزرار:

- Pause
- Resume
- Cancel
- Retry
- Remove

كلها Keyboard Accessible.

## 10.1 Drag & Drop

استخدم:

- `@dnd-kit/core`
- `@dnd-kit/sortable`

يدعم:

- Mouse
- Keyboard
- Visible Focus
- Accessibility

ترتيب Queue محفوظ في `order` داخل `DownloadItem`.

عند إعادة الترتيب يجب تحديث `order` لجميع العناصر المتأثرة.

## 10.2 Concurrent Downloads

Options:

```text
1
2
3
4
5
10
```

Default:

```text
3
```

فقط العدد المحدد يمكن أن يكون `downloading` في نفس الوقت.

البقية تبقى `queued`.

عند انتهاء/إلغاء/فشل Download يجب السماح للعنصر التالي بالدخول إلى `downloading` وفقًا للـ Queue order.

## 10.3 Speed Limit

Options:

```text
500 KB/s
1 MB/s
5 MB/s
10 MB/s
Unlimited
```

Speed Limit **يؤثر فعليًا على Mock Simulation**.

أي:

```text
simulatedSpeed <= configuredSpeedLimit
```

عند `Unlimited` لا يوجد حد اصطناعي.

ETA يعاد حسابه بناءً على السرعة المحاكاة الفعلية.

---

# 11. Download Simulation

عند بدء Download:

```text
queued
→ analyzing
→ downloading
→ merging
→ converting
→ completed
```

Progress يجب أن يكون:

- Non-linear
- Speed متغيرة قليلًا
- ETA متغير
- Downloaded Size متغير
- Total Size ثابت

MUST NOT:

```text
progress += 1
```

بنمط ثابت تمامًا.

المحاكاة يجب أن تكون بسيطة وليست Network Simulator حقيقي.

## 11.1 Completion

عند وصول Download إلى 100%:

```text
downloading → merging → converting → completed
```

يمكن جعل `merging` و`converting` مراحل قصيرة Mock.

## 11.2 Failure

يمكن أن يحدث Failure أثناء:

- analyzing
- downloading
- merging
- converting

ثم:

```text
current-state → failed
```

حسب State Machine في Section 20.

---

# 12. Persistence

## 12.1 Settings

Settings MUST تحفظ عبر:

```text
localStorage
```

فقط، وليس SQLite.

`SettingsService` مسؤول عن:

- Read
- Write
- Defaults
- Zod Validation
- Recovery من البيانات التالفة أو القديمة

## 12.2 Queue / History / Favorites

في Prototype:

**Queue / History / Favorites لا يتم حفظها بعد Reload.**

أي:

- Settings → Persisted
- Queue → Session memory only
- History → Session memory only
- Favorites → Session memory only
- Scheduler → Session memory only

عند Refresh:

- Queue تعود فارغة.
- History تعود إلى Mock Initial Data أو الحالة الابتدائية المحددة من Mock Service.
- Favorites تعود إلى Mock Initial Data أو الحالة الابتدائية المحددة من Mock Service.
- Scheduler يعود إلى الحالة الابتدائية.

هذا القرار مقصود لتقليل Persistence Scope في Prototype.

لا يجوز إضافة `localStorage` لهذه النطاقات إلا بقرار جديد موثق في `DECISIONS.md`.

---

# 13. History

History تعرض:

- Completed
- Failed
- Canceled

كل عنصر:

- Thumbnail
- Title
- Source URL
- Date
- Quality
- Format
- File Size
- Status

الأزرار:

- Re-download
- Open Folder
- Remove

## 13.1 Re-download

Re-download:

1. يستخدم `sourceUrl` الأصلي.
2. يحتفظ بـ Quality.
3. يحتفظ بـ Format.
4. ينشئ `DownloadItem` جديدًا.
5. يضيفه إلى Queue.
6. لا يبدأ Download تلقائيًا.

## 13.2 Open Folder

UI Simulation فقط.

لا يتم فتح Folder حقيقي.

---

# 14. Favorites

كل عنصر:

- Thumbnail
- Title
- Channel
- Source URL
- Date Added

الأزرار:

- Download
- Remove Favorite

Download ينشئ Queue Item جديدًا ولا يبدأ التحميل تلقائيًا.

---

# 15. Scheduler

## 15.1 Fields

باستخدام:

- `react-hook-form`
- `zod`

الحقول:

- URL
- Date
- Time
- Repeat:
  - Once
  - Daily
  - Weekly

## 15.2 Scheduler Simulation

المقصود بـ "State Simulation" هو **محاكاة زمنية فعلية داخل التطبيق**، وليس CRUD ثابتًا فقط.

في Prototype:

- Scheduler يتابع الوقت الحالي عبر Timer.
- عندما يحين الموعد، يتم إنشاء `DownloadItem` وإضافته إلى Queue.
- لا يتم تشغيل OS Scheduler.
- لا يعمل Scheduler عند إغلاق التطبيق.
- لا توجد Native Notifications.
- Repeat schedules يتم حسابها Mock داخل التطبيق.

## 15.3 ScheduledDownload Status

القيم:

```text
scheduled
triggered
completed
failed
canceled
```

---

# 16. Settings

## 16.1 Sections

### General

- Download Folder
- Start with Windows
- Minimize to Tray

كلها UI Settings فقط.

`Download Folder` حقل نصي Mock في هذه المرحلة، وليس Folder Picker حقيقي.

### Appearance

- Light
- Dark
- System

### Language

- Arabic
- English

### Downloads

- Concurrent Downloads
- Speed Limit
- Default Quality
- Default Video Format
- Default Audio Format

### Notifications

- Enable Notifications
- Notification when completed
- Notification when failed

### Clipboard

- Clipboard Monitoring
- Ask before downloading

OS Clipboard Integration غير منفذة.

### Advanced

- yt-dlp path
- FFmpeg path
- Proxy

UI فقط.

## 16.2 Defaults

القيم الافتراضية:

```text
concurrentDownloads: 3
speedLimit: unlimited
defaultQuality: 720p
defaultVideoFormat: mp4
defaultAudioFormat: mp3

enableNotifications: true
notificationWhenCompleted: true
notificationWhenFailed: true

clipboardMonitoring: false
askBeforeDownloading: true

startWithWindows: false
minimizeToTray: false

appearance: system
language: en
```

`downloadFolder` يمكن أن يكون:

```text
~/Downloads
```

كمسار Mock/Display فقط.

Advanced paths تكون فارغة افتراضيًا.

## 16.3 Notification Scope

`Enable Notifications` يتحكم في **non-critical application notifications** مثل:

- Download completed
- Download failed
- Queue added
- Scheduler triggered

لكن **Form Validation Errors** لا تعتمد عليه.

Critical errors التي تتطلب تدخل المستخدم MAY تظهر كـ Modal حتى إذا كانت Notifications disabled.

---

# 17. Smart File Naming

Settings تحتوي على:

```text
%(uploader)s - %(title)s [%(resolution)s].%(ext)s
```

Live Preview:

```text
Example Channel - Amazing Nature Documentary [1080p].mp4
```

لا يتم تنفيذ File Rename حقيقي.

---

# 18. Data Models

يجب وضع Models داخل `src/types/`.

## 18.1 LinkType

```ts
type LinkType =
  | "video"
  | "shorts"
  | "playlist"
  | "playlist-video"
  | "channel";
```

## 18.2 DownloadStatus

```ts
type DownloadStatus =
  | "queued"
  | "analyzing"
  | "downloading"
  | "paused"
  | "merging"
  | "converting"
  | "completed"
  | "failed"
  | "canceled"
  | "retrying";
```

## 18.3 VideoMetadata

يجب أن تحتوي على الأقل على:

```text
id
sourceUrl
linkType
thumbnail
title
channelName
duration
views
qualityOptions
videoFormats
audioFormats
resolution
fps
videoCodec
audioCodec
videoBitrate
audioBitrate
container
fileSize
uploadDate
```

## 18.4 DownloadItem

يجب أن تحتوي على الأقل:

```text
id
sourceUrl
videoMetadataId
thumbnail
title
quality
format
fileSize
downloadedSize
speed
eta
progress
status
order
addedAt
error
retryCount
```

## 18.5 Playlist

```text
id
sourceUrl
title
thumbnail
videoCount
items
```

## 18.6 PlaylistItem

```text
id
sourceUrl
thumbnail
title
duration
selected
metadata
```

`selected` جزء من Playlist UI state، وليس Global Store مستقل.

## 18.7 HistoryItem

```text
id
sourceUrl
thumbnail
title
date
quality
format
fileSize
status
```

وجود `sourceUrl + quality + format` إلزامي لدعم Re-download.

## 18.8 FavoriteItem

```text
id
sourceUrl
thumbnail
title
channel
dateAdded
```

## 18.9 ScheduledDownload

```text
id
sourceUrl
date
time
repeat
status
createdAt
lastTriggeredAt
```

## 18.10 AppSettings

يجب تعريفه عبر Zod Schema ثم inference إلى TypeScript.

## 18.11 AppNotification

```text
id
type
title
message
createdAt
severity
```

## 18.12 ErrorModel

Error Model موحد، منفصل منطقيًا عن AppNotification:

```text
code
message
severity
recoverable
source
details
```

التدفق:

```text
Service Error
    ↓
Error Mapper
    ↓
ErrorModel
    ↓
Store
    ↓
Toast / Modal
```

عند الحاجة إلى Notification يتم تحويل `ErrorModel` إلى `AppNotification`.

---

# 19. Services

يجب وجود Interfaces على الأقل:

- `DownloadService`
- `MetadataService`
- `HistoryService`
- `FavoritesService`
- `SchedulerService`
- `SettingsService`

## 19.1 DownloadService Contract

يجب أن يدعم على الأقل:

```text
add
start
pause
resume
cancel
retry
remove
reorder
getAll
```

Service لا يدير UI.

## 19.2 MetadataService

يجب أن يعيد Result discriminated حسب `linkType`.

يجب أن يدعم:

```text
analyze(url)
```

والنتيجة تحتوي على Metadata مناسبة لنوع الرابط.

## 19.3 HistoryService

على الأقل:

```text
getAll
add
remove
clear
```

## 19.4 FavoritesService

على الأقل:

```text
getAll
add
remove
isFavorite
```

## 19.5 SchedulerService

على الأقل:

```text
getAll
create
update
cancel
remove
tick
```

## 19.6 SettingsService

على الأقل:

```text
get
update
reset
```

مع:

- Zod validation
- localStorage
- Defaults
- Corrupt data recovery

كل هذه Services في Prototype لها Mock Implementations فقط.

---

# 20. Zustand Stores

يجب وجود Stores منفصلة:

1. Queue / Downloads Store
2. Metadata / Analysis Store
3. History Store
4. Favorites Store
5. Scheduler Store
6. Settings Store
7. Dev Tools Store

## 20.1 Dev Tools Store

يحتوي على:

```text
mockScenario
simulationSpeed
isPanelOpen
```

ويمكن أن يحتوي على UI state صغير مرتبط مباشرة بالـ Dev Tools.

هذا Store هو استثناء منطقي من قاعدة "كل Store يعتمد على Service" لأنه Developer-only UI/Test state وليس Domain Data.

## 20.2 Store Rules

- Components لا تستدعي Services.
- Stores تستدعي Service Interfaces.
- لا تكرار لنفس Domain State.
- لا يوجد نفس DownloadItem في أكثر من Store.
- لا تستخدم Context API.

---

# 21. Complete State Machine

هذه هي **المصفوفة الرسمية الوحيدة** للانتقالات.

## 21.1 Allowed Transitions

| From | To | Allowed |
|---|---|---|
| queued | analyzing | YES |
| queued | canceled | YES |
| analyzing | downloading | YES |
| analyzing | failed | YES |
| analyzing | canceled | YES |
| downloading | paused | YES |
| downloading | merging | YES |
| downloading | failed | YES |
| downloading | canceled | YES |
| paused | downloading | YES |
| paused | canceled | YES |
| paused | failed | YES |
| merging | converting | YES |
| merging | failed | YES |
| merging | canceled | YES |
| converting | completed | YES |
| converting | failed | YES |
| converting | canceled | YES |
| failed | retrying | YES |
| retrying | analyzing | YES |
| canceled | retrying | YES |

## 21.2 Forbidden Transitions

كل انتقال غير موجود في جدول Allowed ممنوع.

أمثلة مهمة:

```text
completed → downloading ❌
completed → paused ❌
completed → retrying ❌

canceled → paused ❌
canceled → downloading ❌
canceled → analyzing ❌

queued → converting ❌
queued → completed ❌

paused → merging ❌
paused → converting ❌

failed → downloading ❌
failed → completed ❌

merging → downloading ❌
converting → downloading ❌
```

## 21.3 Retry Semantics

عند `Retry`:

```text
failed
→ retrying
→ analyzing
→ downloading
```

Retry يبدأ **من Progress = 0** في Prototype.

`retryCount` يزيد بمقدار 1.

لا يوجد Resume-from-partial-download في هذه المرحلة.

## 21.4 Cancel Semantics

Cancel من:

- queued
- analyzing
- downloading
- paused
- merging
- converting

ينتقل إلى:

```text
canceled
```

ولا يمكن إعادته مباشرة إلى downloading.

يمكن للمستخدم استخدام Retry على canceled:

```text
canceled → retrying → analyzing
```

---

# 22. Error Handling

## 22.1 Global Error Flow

```text
Service Error
    ↓
Error Mapper
    ↓
ErrorModel
    ↓
Store
    ↓
Toast / Modal
```

لا يتم بناء Error Handling مستقل لكل Page.

## 22.2 Error Scenarios

يجب دعم:

- Network Error
- Video Unavailable
- Disk Full
- Permission Denied
- yt-dlp Error
- FFmpeg Error

كلها Mock فقط.

---

# 23. Mock Scenario System

Development فقط:

```text
Success
Network Error
Video Unavailable
Disk Full
Permission Denied
yt-dlp Error
FFmpeg Error
```

يتم التحقق من:

```ts
import.meta.env.DEV
```

MUST NOT يظهر في Production.

---

# 24. Dev Tools

اختصار افتراضي:

```text
Ctrl + Shift + D
```

Panel يحتوي:

- Mock Scenario
- Simulation Speed
- Seed Demo Data
- Clear Mock Data
- Reset Settings
- Simulate Download
- Simulate Error

لا يظهر إطلاقًا في Production.

لا يتم بناء Dev Tools كمنتج مستقل.

---

# 25. Empty / Loading / Skeleton States

كل صفحة MUST تحتوي Empty State مناسبًا.

أمثلة:

- No downloads yet
- No favorites yet
- No scheduled downloads
- No history yet

يجب استخدام Skeleton Loaders أثناء:

- Analyze
- Playlist Loading
- History Loading
- Favorites Loading

---

# 26. Accessibility

يجب دعم:

- Semantic HTML
- Keyboard Navigation
- Visible Focus
- ARIA Labels
- Accessible Forms
- Accessible Dialogs
- Accessible Buttons

Progress Bar:

```text
aria-valuenow
aria-valuemin
aria-valuemax
aria-valuetext
```

Pause / Resume / Cancel MUST تعمل بالكامل من Keyboard.

Drag & Drop MUST يدعم Keyboard.

RTL/LTR يجب مراعاتهما.

---

# 27. Testing

Tools:

- Vitest
- @testing-library/react
- @testing-library/user-event عند الحاجة

## 27.1 Test Classification

### Unit Tests

- State Machine
- URL Validation
- Mock Service logic
- Error Mapper
- Utility functions

### Integration Tests

- Store ↔ Service
- Download lifecycle
- Pause / Resume / Retry / Cancel
- History updates
- Favorites updates
- Scheduler trigger behavior

### Component / Smoke Tests

- Navigation
- Main forms
- Analyze
- Add to Queue
- Queue controls
- Settings
- Dialogs

## 27.2 Required Cases

يجب اختبار:

- كل Allowed State Transitions.
- Forbidden State Transitions.
- Empty URL.
- Invalid URL.
- Unsupported URL.
- Analyze loading.
- Double Analyze prevention.
- Successful Analysis.
- Video / Shorts / Playlist / Playlist Video / Channel.
- Service Errors.
- Add to Queue.
- Pause.
- Resume.
- Cancel.
- Retry.
- Remove.
- Full lifecycle.
- Concurrent Downloads.
- Speed Limit.
- Scheduler trigger.
- Settings persistence.
- Corrupted Settings fallback.
- Basic Accessibility interactions.

---

# 28. Performance

MUST تجنب:

- Unnecessary Re-renders
- Huge Components
- Duplicated State
- Heavy Dependencies

Componentization جيد.

Virtualization غير مطلوبة حاليًا.

---

# 29. Security Preparation

MUST NOT:

- استخدام `dangerouslySetInnerHTML`.
- تنفيذ Shell Commands.
- تنفيذ JavaScript يقدمه المستخدم.
- تشغيل yt-dlp أو FFmpeg.
- الوصول إلى Filesystem الحقيقي.

---

# 30. About

اسم البرنامج:

```text
Remon Download
```

الوصف:

> برنامج لتنزيل وإدارة الفيديوهات والملفات الإعلامية بطريقة منظمة وسهلة.

يجب عرض:

- Application Name
- Version
- Developer
- Contact

لا يوجد Login / Account.

Version يجب أن تكون Dynamic من `package.json` أو آلية مناسبة متوافقة مع Vite.

MUST NOT Hardcode Version داخل Component.

---

# 31. Electron Preparation

Electron غير مسموح به الآن.

لكن Architecture يجب أن تسمح مستقبلًا بإضافة:

- Taskbar Progress
- System Tray
- Native Notifications
- Auto Start
- Clipboard Monitoring
- Filesystem
- yt-dlp
- FFmpeg
- SQLite
- Electron IPC

دون إعادة بناء Components جذريًا.

---

# 32. Explicitly Out of Scope

| Feature | Status |
|---|---|
| Electron | Later |
| Backend | Later |
| SQLite | Later |
| yt-dlp real execution | Later |
| FFmpeg real execution | Later |
| Real Downloads | Later |
| Authentication | Never in this product scope |
| Login / Register | Never |
| Cloud Sync | Not required |
| Payment / Subscription | Not required |
| Real Clipboard Integration | Later |
| Taskbar | Later |
| System Tray | Later |
| Native Windows APIs | Later |
| Redux | Forbidden |
| Context API Global State | Forbidden |
| Visual Regression | Not required |
| Microservices | Forbidden |
| Complex DI | Forbidden |

---

# 33. Implementation Order

يجب التنفيذ بهذا الترتيب:

1. Dashboard
2. Download Queue
3. History
4. Favorites
5. Scheduler
6. Settings
7. About

كل Feature يجب أن تكون حقيقية وقابلة للتفاعل.

لا يجوز ترك TODO في Core Functionality.

---

# 34. Architectural Decision Rules

لا يجوز للـ AI تغيير قرار معماري محسوم بشكل منفرد.

إذا ظهر احتياج لتغيير:

- React Architecture
- Zustand
- Service Layer
- UI / Business Logic separation
- Data Architecture
- Electron Readiness

يجب:

1. شرح المشكلة.
2. عرض البدائل.
3. شرح تأثير كل بديل.
4. التوقف وانتظار موافقة المستخدم.

القرارات الصغيرة القابلة للعكس يجوز اتخاذها مباشرة وتسجيلها في `DECISIONS.md`.

---

# 35. Git Rules

Git مسؤولية المستخدم فقط.

AI Coding Agent MUST NOT:

- git add
- git commit
- git push
- git pull
- git checkout
- git switch
- git merge
- git rebase
- إنشاء Branch
- حذف Branch
- تعديل Git Configuration
- تنفيذ أي أمر يبدأ بـ `git`

بعد Feature رئيسية:

- Update Documentation.
- Run Tests.
- Run Build.
- Inform user that Feature is ready for manual Git Commit.

لا يوجد Git Checkpoint آلي.

---

# 36. Documentation / AI Handoff

## 36.1 Source of Truth

المشروع لا يعتمد على Chat Memory.

المعلومات المهمة يجب أن تكون في:

```text
docs/
```

## 36.2 Required Files

```text
docs/
├── SPEC.md
├── ARCHITECTURE.md
├── DEVELOPMENT_STATUS.md
├── DECISIONS.md
├── CHANGELOG.md
├── KNOWN_ISSUES.md
└── AI_HANDOFF.md
```

## 36.3 SPEC.md

نسخة كاملة من هذه الوثيقة.

أي تغيير مستقبلي في Requirements:

1. يتم اقتراحه.
2. يحصل على موافقة المستخدم.
3. يتم تحديث `SPEC.md`.

## 36.4 ARCHITECTURE.md

يحتوي:

- Architecture
- Folder Structure
- Zustand Stores
- Services
- Components
- Data Flow
- Important Decisions

## 36.5 DEVELOPMENT_STATUS.md

يجب أن يحتوي دائمًا:

```text
Current Phase:
Current Version:

Completed:
- ...

In Progress:
- ...

Pending:
- ...

Blocked:
- ...

Known Bugs:
- ...

Next Recommended Task:
- ...
```

## 36.6 DECISIONS.md

Format:

```text
Decision:
...

Reason:
...

Date:
YYYY-MM-DD
```

## 36.7 CHANGELOG.md

مثال:

```text
## 0.2.0

Added:
- Download Queue
- Mock Progress
- Favorites

Changed:
- Dashboard layout

Fixed:
- Queue synchronization
```

## 36.8 KNOWN_ISSUES.md

لكل مشكلة:

```text
Issue:
Description:
Steps to reproduce:
Expected:
Actual:
Priority:
Status:
```

## 36.9 AI_HANDOFF.md

يجب أن يحتوي على:

```text
PROJECT:
Remon Download

CURRENT PHASE:
React Prototype

TECH STACK:
React, TypeScript, Vite, Tailwind CSS, Zustand,
@dnd-kit, sonner, react-hook-form, zod, i18next, vitest

NOT USING:
Electron, yt-dlp, FFmpeg, SQLite, Backend, Authentication

CURRENT STATUS:
...

LAST COMPLETED TASK:
...

CURRENT TASK:
...

NEXT TASK:
...

IMPORTANT DECISIONS:
- No Login
- React only during Prototype
- Mock Services
- Settings persisted through localStorage
- Queue/History/Favorites/Scheduler are session-only
- Zustand only for global state
- Electron-ready Service Architecture
- No Git operations by AI

KNOWN ISSUES:
...

DO NOT:
- Start Electron
- Add Backend
- Add Authentication
- Replace React
- Replace Zustand
- Rewrite working Features without reason
```

## 36.10 README.md

**Reference:** هذا القسم هو الصحيح لـ README (وليس 35.7).

يجب أن يحتوي:

- Project Name
- Description
- Node.js 20/22 LTS
- `npm install`
- `npm run dev`
- `npm run build`
- Link إلى `docs/AI_HANDOFF.md`
- Link إلى `docs/DEVELOPMENT_STATUS.md`

## 36.11 Feature Completion Rule

بعد كل Feature رئيسية:

1. Update `DEVELOPMENT_STATUS.md`.
2. Update `CHANGELOG.md`.
3. Update `AI_HANDOFF.md`.
4. Update `KNOWN_ISSUES.md` عند الحاجة.
5. Update `DECISIONS.md` عند وجود قرار مهم.
6. Run tests.
7. Run build.
8. Confirm stable code/documentation state.
9. Tell user Feature is ready for manual Git Commit.

هذا Stable Checkpoint ليس Git Checkpoint.

## 36.12 Handoff

قبل توقف متوقع أو انتقال إلى AI آخر:

- Update `DEVELOPMENT_STATUS.md`.
- Update `AI_HANDOFF.md`.
- Update `CHANGELOG.md`.

لكن لا تعتمد على Handoff فقط؛ يجب تحديث Documentation بعد كل Feature رئيسية.

## 36.13 New AI Startup Procedure

قبل تعديل أي Code:

1. اقرأ `docs/SPEC.md`.
2. اقرأ `docs/ARCHITECTURE.md`.
3. اقرأ `docs/DEVELOPMENT_STATUS.md`.
4. اقرأ `docs/DECISIONS.md`.
5. اقرأ `docs/AI_HANDOFF.md`.
6. افحص `package.json`.
7. افحص `src/`.
8. حدد Completed / In Progress / Pending / Issues.
9. نفذ Next Task فقط.

MUST NOT إعادة بناء المشروع من الصفر.

## 36.14 No Rewrite Rule

إذا كان Feature موجودًا ويعمل:

- لا تعِد كتابته بالكامل.
- افهم الكود.
- عدّل المطلوب فقط.
- لا تغيّر Architecture أو Libraries الأساسية دون سبب موثق وموافقة عند الحاجة.

---

# 37. Final Acceptance Criteria

Prototype لا يعتبر مكتملًا إلا إذا كان التالي يعمل فعليًا:

- [ ] Navigation بين الصفحات السبع
- [ ] Dashboard Quick Add URL
- [ ] URL Validation
- [ ] Analyze Loading
- [ ] Double Analyze Prevention
- [ ] Video Mock Analysis
- [ ] Shorts Mock Analysis
- [ ] Playlist Mock Analysis
- [ ] Video-in-Playlist Mock Analysis
- [ ] Channel Mock Analysis
- [ ] Add Single Video to Queue
- [ ] Playlist Selection
- [ ] Download Selected
- [ ] Download Entire Playlist
- [ ] Channel Selection
- [ ] Download Queue
- [ ] Drag & Drop Mouse
- [ ] Drag & Drop Keyboard
- [ ] Non-linear Mock Download
- [ ] Concurrent Downloads
- [ ] Speed Limiter
- [ ] Pause
- [ ] Resume
- [ ] Retry
- [ ] Cancel
- [ ] Remove
- [ ] History
- [ ] Re-download
- [ ] Open Folder Mock
- [ ] Favorites
- [ ] Scheduler
- [ ] Scheduler timed simulation
- [ ] Settings
- [ ] Settings localStorage Persistence
- [ ] Corrupted Settings Recovery
- [ ] Smart File Naming Preview
- [ ] Light
- [ ] Dark
- [ ] System
- [ ] Arabic
- [ ] English
- [ ] RTL
- [ ] LTR
- [ ] Global Error Handling
- [ ] Error Boundary
- [ ] All Mock Error Scenarios
- [ ] Development-only Dev Tools
- [ ] Empty States
- [ ] Skeleton Loading
- [ ] Accessibility
- [ ] Tests
- [ ] Successful Build
- [ ] Complete `docs/`
- [ ] Updated README

---

# 38. Final Handoff Report

عند اكتمال Prototype يجب على AI تقديم تقرير نهائي يوضح:

1. ما تم تنفيذه.
2. Project Structure.
3. أهم Components.
4. Zustand Store Architecture.
5. Service Architecture.
6. كيفية فصل Mock Services عن UI.
7. كيفية عمل State Machine.
8. كيفية عمل Mock Download Simulation.
9. كيفية عمل Settings Persistence.
10. كيفية الانتقال مستقبلًا إلى:
    - Electron
    - Node.js
    - yt-dlp
    - FFmpeg
    - SQLite
11. أي قرارات تحتاج موافقة المستخدم قبل Phase 2.
12. نتائج Tests.
13. نتيجة `npm run build`.
14. Known Issues المتبقية.

---

# 39. Mandatory AI Execution Rules

عند إعطاء هذه الوثيقة إلى AI Coding Agent:

1. لا تبدأ بكتابة كل المشروع دفعة واحدة بطريقة غير قابلة للمراجعة.
2. نفذ Features حسب Section 33.
3. بعد كل Feature رئيسية:
   - Tests
   - Build
   - Documentation
   - Stable Checkpoint
4. لا تنفذ Git operations.
5. لا تضف Backend.
6. لا تبدأ Electron.
7. لا تستخدم Real yt-dlp / FFmpeg.
8. لا تستخدم SQLite.
9. لا تضف Login.
10. لا تستبدل Zustand.
11. لا تستورد Services من Components.
12. لا تخترع Architecture جديدة.
13. لا تحذف Requirements.
14. عند ظهور مشكلة مع قرار معماري محسوم، توقف واتبع Section 34.
15. عند وجود قرار صغير قابل للعكس، اختر الحل الاحترافي الأبسط وسجله في `DECISIONS.md`.
16. يجب أن يكون المشروع في حالة قابلة للتشغيل بعد كل Feature رئيسية.
17. لا تترك Core Feature في حالة TODO.
18. لا تعتمد على المحادثة كذاكرة للمشروع؛ حدّث ملفات `docs/`.

---

# 40. Implementation Start

عند بدء التنفيذ:

### Step 1

افحص:

```text
package.json
src/
docs/
```

إذا كان المشروع موجودًا، لا تعِد إنشاءه من الصفر.

### Step 2

أنشئ/حدّث:

```text
docs/SPEC.md
docs/ARCHITECTURE.md
docs/DEVELOPMENT_STATUS.md
docs/DECISIONS.md
docs/CHANGELOG.md
docs/KNOWN_ISSUES.md
docs/AI_HANDOFF.md
README.md
.env.example
```

### Step 3

تحقق من:

- Node version
- TypeScript strict mode
- Vite
- Tailwind
- Zustand
- React Router
- Approved dependencies

### Step 4

ابدأ بـ:

```text
Dashboard
```

ثم:

```text
Queue
→ History
→ Favorites
→ Scheduler
→ Settings
→ About
```

### Step 5

بعد كل Feature:

```text
Test
→ Build
→ Documentation Update
→ Stable Checkpoint
→ Notify User
```

**لا تنفذ أي Git command.**

---

# 41. Final Architectural Decisions Summary

هذه القرارات أصبحت محسومة في هذه النسخة:

| Decision | Final Rule |
|---|---|
| UI | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Global State | Zustand only |
| Services | Interface + Mock Implementation |
| Real Backend | No |
| Electron | Later |
| yt-dlp | Mock only |
| FFmpeg | Mock only |
| SQLite | Later |
| Settings Persistence | localStorage |
| Queue Persistence | Session only |
| History Persistence | Session only |
| Favorites Persistence | Session only |
| Scheduler Persistence | Session only |
| Single Video | Add to Queue |
| Playlist | Select + Add to Queue |
| Channel | Mock list + Select + Add to Queue |
| Retry | Restart from 0% |
| Speed Limit | Applies to Mock Speed |
| Scheduler | In-app timed simulation |
| Notifications | Controlled by Settings except validation/critical modal behavior |
| RTL | Automatically follows language |
| Dev Tools | Development only |
| Git | User only |
| Login | Not allowed |
| Authentication | Not allowed |
| Architecture Changes | Require Section 34 procedure |

**هذه النسخة هي Specification النهائية الجاهزة للتنفيذ.**
