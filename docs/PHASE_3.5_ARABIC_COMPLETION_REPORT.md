# تقرير Phase 3.5 — Windows Installer & Packaging

## الحالة

Phase 3.5 منفذة برمجيًا، لكنها لا تحمل اعتمادًا نهائيًا قبل إكمال اختبار Installer اليدوي على Windows.

## ما تم تغييره

- إعداد electron-builder مع `appId: com.remon.download` و`productName: Remon Download`.
- إضافة NSIS Installer كالتوزيع الرسمي.
- إبقاء Portable كخيار اختياري.
- تفعيل `asar`.
- إضافة `extraResources` لـ `yt-dlp.exe` و`ffmpeg.exe` و`ffprobe.exe` خارج `app.asar`.
- إضافة resolver محدود لمسارات Production باستخدام `process.resourcesPath`.
- الإبقاء على Settings path وPATH كـ fallback.
- تمرير مجلد FFmpeg المضمّن إلى yt-dlp.
- الحفاظ على التخزين في Electron `userData` خارج مجلد التثبيت.
- ضبط مسارات Production وVite relative assets وHashRouter.
- تحديث توثيق README وArchitecture وDevelopment Status وChangelog.

## Runtime Strategy

توجد الملفات التنفيذية في `runtime/` أثناء البناء، وتُنسخ إلى:

```text
resources/runtime/
```

داخل النسخة المعبأة، وليس داخل `app.asar`.

## Installer Configuration

- NSIS Installer رسمي.
- Desktop Shortcut.
- Start Menu Shortcut.
- Uninstaller.
- `icon.ico` للأيقونة.
- Portable اختياري.
- لا يوجد Auto Update.

## User Data

الملفات التالية تبقى في `app.getPath("userData")`:

- `history.json`
- `favorites.json`
- `scheduler.json`
- `settings.json`

لا ينبغي أن يحذفها Uninstaller أو Update.

## نتائج الاختبارات

- Native Download وMetadata: `63/63` ناجحة.
- Bundled binaries: yt-dlp وFFmpeg وffprobe تعمل محليًا.
- TypeScript Electron check: ناجح.
- Vite production build: ناجح.
- Electron bundle build: ناجح.
- Dashboard وQueue focused tests: ناجحة سابقًا.
- Full test command: يوجد `381 passed` و`27 failed` في 5 suites بسبب `window.localStorage.clear is not a function` في بيئة الاختبار، ويحتاج هذا إلى معالجة منفصلة قبل الاعتماد النهائي.

## Manual E2E

Manual Windows Installer E2E Pending.

لم يتم اعتماد Phase رسميًا بعد حتى يتم تثبيت Installer وتشغيله فعليًا والتحقق من الاختصارات وRuntime والتنزيلات وUninstall/Reinstall.

## Known Issues / Risks

- يجب اختبار Installer على Windows 10 وWindows 11.
- يجب التأكد من أن Windows Toast يربط التطبيق بـ `Remon Download` بعد تثبيت اختصار جديد.
- Runtime binaries كبيرة الحجم ويجب مراجعة مصدرها وترخيص توزيعها قبل نشر عام.
- يجب عدم تشغيل نسخة `electron .` أو `electron:dev` في اختبار هوية Windows النهائية.
- يجب معالجة فشل localStorage في full test environment قبل Definition of Done النهائية.

## Definition of Done Status

غير مكتملة نهائيًا حتى يتحقق:

- Installer E2E Passed.
- Portable E2E Passed.
- Runtime download tests بعد التغليف.
- Uninstall/Reinstall data preservation.
- Full tests بدون failures.
- Manual Windows E2E Passed.
