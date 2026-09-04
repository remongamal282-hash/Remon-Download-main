import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const resources = {
  en: {
    translation: {
      app: {
        name: "Remon Download"
      },
      nav: {
        dashboard: "Dashboard",
        queue: "Download Queue",
        history: "History",
        favorites: "Favorites",
        scheduler: "Scheduler",
        settings: "Settings",
        about: "About"
      },
      dashboard: {
        title: "Quick Add",
        subtitle: "Analyze a YouTube video, short, playlist, playlist video, or channel.",
        urlLabel: "YouTube URL",
        urlPlaceholder: "https://www.youtube.com/watch?v=...",
        clearUrl: "Clear URL",
        analyze: "Analyze",
        analyzing: "Analyzing...",
        detected: "Detected",
        playlistNotice: "Playlist detected. Choose videos before adding them to the queue.",
        playlistVideoNotice: "Video inside playlist detected. Only this video will be added.",
        channelNotice: "Channel detected. Channel-wide downloads are not available in this prototype.",
        addToQueue: "Add to Queue",
        addSelected: "Add Selected to Queue",
        downloadEntirePlaylist: "Download Entire Playlist",
        selectAll: "Select All",
        deselectAll: "Deselect All",
        videoInfo: "Video Info",
        queueCount: "{{count}} item in queue",
        queueCount_plural: "{{count}} items in queue"
      },
      queue: {
        title: "Download Queue",
        summary: "{{total}} total · {{active}} active · {{completed}} completed",
        concurrent: "Concurrent downloads",
        speedLimit: "Speed limit",
        emptyTitle: "No downloads yet",
        emptyDescription: "Analyze a YouTube link from the Dashboard and add it to the queue.",
        reorder: "Reorder {{title}}",
        pause: "Pause",
        resume: "Resume",
        openFolder: "Open Folder",
        cancel: "Cancel",
        retry: "Retry",
        remove: "Remove",
        fail: "Fail",
        mockError: "Mock error",
        progressFor: "Progress for {{title}}",
        quality: "Quality",
        format: "Format",
        size: "Size",
        downloaded: "Downloaded",
        speed: "Speed",
        eta: "ETA",
        status: {
          queued: "Queued",
          analyzing: "Analyzing",
          downloading: "Downloading",
          paused: "Paused",
          merging: "Merging",
          converting: "Converting",
          completed: "Completed",
          failed: "Failed",
          canceled: "Canceled",
          retrying: "Retrying"
        },
        errorLabels: {
          network_error: "Network",
          video_unavailable: "Unavailable",
          disk_full: "Disk full",
          permission_denied: "Permission",
          ytdlp_error: "yt-dlp",
          ffmpeg_error: "FFmpeg"
        },
        speedLabels: {
          "500kb": "500 KB/s",
          "1mb": "1 MB/s",
          "5mb": "5 MB/s",
          "10mb": "10 MB/s",
          unlimited: "Unlimited"
        }
      },
      history: {
        title: "History",
        summary: "{{count}} history item",
        summary_plural: "{{count}} history items",
        loading: "Loading history",
        emptyTitle: "No history yet",
        emptyDescription: "Completed, failed, and canceled downloads will appear here.",
        date: "Date",
        quality: "Quality",
        format: "Format",
        size: "Size",
        statusLabel: "Status",
        addToFavorites: "Add to Favorites",
        redownload: "Re-download",
        openFolder: "Open Folder",
        remove: "Remove",
        status: {
          completed: "Completed",
          failed: "Failed",
          canceled: "Canceled"
        },
        toast: {
          redownloaded: "Added back to queue.",
          openFolderMock: "Open Folder is simulated in this prototype.",
          addedToFavorites: "Added to favorites.",
          addToFavoritesFailed: "Failed to add to favorites."
        },
        errors: {
          notFound: "History item was not found."
        }
      },
      favorites: {
        title: "Favorites",
        summary: "{{count}} favorite",
        summary_plural: "{{count}} favorites",
        loading: "Loading favorites",
        emptyTitle: "No favorites yet",
        emptyDescription: "Favorite videos will appear here for quick downloading.",
        dateAdded: "Date added",
        download: "Download",
        remove: "Remove favorite",
        toast: {
          downloadQueued: "Favorite added to queue."
        },
        errors: {
          notFound: "Favorite item was not found."
        }
      },
      scheduler: {
        title: "Scheduler",
        summary: "{{count}} scheduled download",
        summary_plural: "{{count}} scheduled downloads",
        loading: "Loading scheduled downloads",
        emptyTitle: "No scheduled downloads",
        emptyDescription: "Create a schedule to add a YouTube link to the queue when its time arrives.",
        url: "YouTube URL",
        urlPlaceholder: "https://www.youtube.com/watch?v=...",
        date: "Date",
        time: "Time",
        repeat: "Repeat",
        create: "Create",
        nextRun: "Next run",
        triggerCount: "Triggers",
        lastTriggered: "Last triggered",
        never: "Never",
        cancel: "Cancel",
        remove: "Remove",
        repeatOptions: {
          once: "Once",
          daily: "Daily",
          weekly: "Weekly"
        },
        status: {
          scheduled: "Scheduled",
          triggered: "Triggered",
          completed: "Completed",
          failed: "Failed",
          canceled: "Canceled"
        },
        validation: {
          dateRequired: "Choose a date.",
          timeRequired: "Choose a time."
        },
        toast: {
          created: "Scheduled download created.",
          scheduled: "Download will start at the scheduled time.",
          triggered: "Scheduled download added to queue.",
          triggeredDescription: "Click 'Go to Queue' to view the download.",
          goToQueue: "Go to Queue"
        },
        errors: {
          notFound: "Scheduled download was not found."
        }
      },
      settings: {
        title: "Settings",
        subtitle: "Preferences are saved automatically in this prototype.",
        reset: "Reset settings",
        autoSaved: "Changes are saved automatically.",
        sections: {
          general: "General",
          appearance: "Appearance",
          downloads: "Downloads",
          notifications: "Notifications",
          clipboard: "Clipboard",
          advanced: "Advanced",
          fileNaming: "Smart file naming"
        },
        downloadFolder: "Download folder",
        browse: "Browse",
        startWithWindows: "Start with Windows",
        minimizeToTray: "Minimize to tray",
        theme: "Theme",
        themeOptions: {
          light: "Light",
          dark: "Dark",
          system: "System"
        },
        language: "Language",
        languageOptions: {
          en: "English",
          ar: "Arabic"
        },
        concurrentDownloads: "Concurrent downloads",
        speedLimit: "Speed limit",
        defaultQuality: "Default quality",
        defaultVideoFormat: "Default video format",
        defaultAudioFormat: "Default audio format",
        enableNotifications: "Enable notifications",
        notificationWhenCompleted: "Notify when completed",
        notificationWhenFailed: "Notify when failed",
        clipboardMonitoring: "Clipboard monitoring",
        askBeforeDownloading: "Ask before downloading",
        ytdlpPath: "yt-dlp path",
        ffmpegPath: "FFmpeg path",
        proxy: "Proxy",
        fileNameTemplate: "File name template",
        fileNamePreview: "Live preview",
        toast: {
          reset: "Settings reset to defaults.",
          folderPickerUnavailable: "Folder picker is only available in the desktop app."
        }
      },
      validation: {
        emptyUrl: "Enter a YouTube URL.",
        invalidUrl: "Enter a valid URL."
      },
      errors: {
        unsupportedUrl: "This URL is valid but unsupported. Use a YouTube link.",
        networkError: "Mock network error.",
        videoUnavailable: "Mock video unavailable error.",
        diskFull: "Mock disk full error.",
        permissionDenied: "Mock permission denied error.",
        ytdlpError: "Mock yt-dlp error.",
        ffmpegError: "Mock FFmpeg error.",
        unknown: "Something went wrong while analyzing the link."
      },
      toast: {
        addedToQueue: "Added to queue.",
        addedManyToQueue: "Added {{count}} items to queue."
      },
      common: {
        empty: "Nothing here yet.",
        version: "Version"
      },
      about: {
        description: "A desktop-style manager for organizing video and media downloads.",
        developerTitle: "About the developer",
        developerDescription: "Remon Gamal is a software developer focused on modern frontend and cross-platform desktop applications, with an emphasis on reliable performance and clear user experiences.",
        productTitle: "Remon Download",
        productDescription: "An independent application for managing video and audio downloads with queue management, quality selection, pause, resume, retry, scheduling, history, favorites, system tray integration, notifications, and persistent settings.",
        platforms: "Supported platforms",
        platformList: "Windows, macOS, Linux",
        copyright: "© 2026 Remon Gamal — All Rights Reserved",
        applicationName: "Application name",
        details: "Application details",
        developer: "Developer",
        contact: "Contact",
        phone: "Phone",
        whatsapp: "WhatsApp",
        email: "Email"
      },
      devTools: {
        title: "Dev Tools",
        shortcut: "Ctrl + Shift + D",
        close: "Close Dev Tools",
        mockScenario: "Mock Scenario",
        simulationSpeed: "Simulation Speed",
        seedDemoData: "Seed Demo Data",
        clearMockData: "Clear Mock Data",
        resetSettings: "Reset Settings",
        simulateDownload: "Simulate Download",
        simulateError: "Simulate Error",
        speedValue: "{{speed}}x",
        scenarios: {
          success: "Success",
          network_error: "Network Error",
          video_unavailable: "Video Unavailable",
          disk_full: "Disk Full",
          permission_denied: "Permission Denied",
          ytdlp_error: "yt-dlp Error",
          ffmpeg_error: "FFmpeg Error"
        },
        toast: {
          seeded: "Demo queue data added.",
          cleared: "Mock data cleared.",
          settingsReset: "Settings reset.",
          simulatedDownload: "Mock download added.",
          errorSimulated: "Mock error simulated."
        }
      }
    }
  },
  ar: {
    translation: {
      app: {
        name: "Remon Download"
      },
      nav: {
        dashboard: "لوحة التحكم",
        queue: "قائمة التنزيل",
        history: "السجل",
        favorites: "المفضلة",
        scheduler: "المجدول",
        settings: "الإعدادات",
        about: "حول"
      },
      dashboard: {
        title: "إضافة سريعة",
        subtitle: "حلل رابط فيديو أو شورت أو قائمة تشغيل أو قناة من YouTube.",
        urlLabel: "رابط YouTube",
        urlPlaceholder: "https://www.youtube.com/watch?v=...",
        clearUrl: "مسح الرابط",
        analyze: "تحليل",
        analyzing: "جار التحليل...",
        detected: "تم الاكتشاف",
        playlistNotice: "تم اكتشاف قائمة تشغيل. اختر الفيديوهات قبل إضافتها للقائمة.",
        playlistVideoNotice: "تم اكتشاف فيديو داخل قائمة تشغيل. سيتم إضافة هذا الفيديو فقط.",
        channelNotice: "تم اكتشاف قناة. تنزيل القناة بالكامل غير متاح في هذا النموذج.",
        addToQueue: "إضافة للقائمة",
        addSelected: "إضافة المحدد للقائمة",
        downloadEntirePlaylist: "إضافة القائمة بالكامل",
        selectAll: "تحديد الكل",
        deselectAll: "إلغاء التحديد",
        videoInfo: "معلومات الفيديو",
        queueCount: "عنصر واحد في القائمة",
        queueCount_plural: "{{count}} عناصر في القائمة"
      },
      queue: {
        title: "قائمة التنزيل",
        summary: "{{total}} إجمالي · {{active}} نشط · {{completed}} مكتمل",
        concurrent: "التنزيلات المتزامنة",
        speedLimit: "حد السرعة",
        emptyTitle: "لا توجد تنزيلات بعد",
        emptyDescription: "حلل رابط YouTube من لوحة التحكم ثم أضفه إلى القائمة.",
        reorder: "إعادة ترتيب {{title}}",
        pause: "إيقاف مؤقت",
        resume: "استئناف",
        openFolder: "فتح المجلد",
        cancel: "إلغاء",
        retry: "إعادة المحاولة",
        remove: "حذف",
        fail: "فشل",
        mockError: "خطأ تجريبي",
        progressFor: "تقدم {{title}}",
        quality: "الجودة",
        format: "الصيغة",
        size: "الحجم",
        downloaded: "تم تنزيله",
        speed: "السرعة",
        eta: "الوقت المتبقي",
        status: {
          queued: "في الانتظار",
          analyzing: "تحليل",
          downloading: "تنزيل",
          paused: "متوقف",
          merging: "دمج",
          converting: "تحويل",
          completed: "مكتمل",
          failed: "فشل",
          canceled: "ملغي",
          retrying: "إعادة محاولة"
        },
        errorLabels: {
          network_error: "الشبكة",
          video_unavailable: "غير متاح",
          disk_full: "القرص ممتلئ",
          permission_denied: "الصلاحيات",
          ytdlp_error: "yt-dlp",
          ffmpeg_error: "FFmpeg"
        },
        speedLabels: {
          "500kb": "500 KB/s",
          "1mb": "1 MB/s",
          "5mb": "5 MB/s",
          "10mb": "10 MB/s",
          unlimited: "غير محدود"
        }
      },
      history: {
        title: "السجل",
        summary: "عنصر سجل واحد",
        summary_plural: "{{count}} عناصر في السجل",
        loading: "جار تحميل السجل",
        emptyTitle: "لا يوجد سجل بعد",
        emptyDescription: "ستظهر هنا التنزيلات المكتملة والفاشلة والملغية.",
        date: "التاريخ",
        quality: "الجودة",
        format: "الصيغة",
        size: "الحجم",
        statusLabel: "الحالة",
        addToFavorites: "إضافة للمفضلة",
        redownload: "إعادة التنزيل",
        openFolder: "فتح المجلد",
        remove: "حذف",
        status: {
          completed: "مكتمل",
          failed: "فشل",
          canceled: "ملغي"
        },
        toast: {
          redownloaded: "تمت الإضافة إلى القائمة مرة أخرى.",
          openFolderMock: "فتح المجلد محاكاة فقط في هذا النموذج.",
          addedToFavorites: "تمت الإضافة للمفضلة.",
          addToFavoritesFailed: "فشل إضافة للمفضلة."
        },
        errors: {
          notFound: "عنصر السجل غير موجود."
        }
      },
      favorites: {
        title: "المفضلة",
        summary: "عنصر مفضل واحد",
        summary_plural: "{{count}} عناصر مفضلة",
        loading: "جار تحميل المفضلة",
        emptyTitle: "لا توجد مفضلة بعد",
        emptyDescription: "ستظهر هنا الفيديوهات المفضلة لتنزيلها بسرعة.",
        dateAdded: "تاريخ الإضافة",
        download: "تنزيل",
        remove: "حذف من المفضلة",
        toast: {
          downloadQueued: "تمت إضافة المفضل إلى القائمة."
        },
        errors: {
          notFound: "عنصر المفضلة غير موجود."
        }
      },
      scheduler: {
        title: "المجدول",
        summary: "تنزيل مجدول واحد",
        summary_plural: "{{count}} تنزيلات مجدولة",
        loading: "جار تحميل التنزيلات المجدولة",
        emptyTitle: "لا توجد تنزيلات مجدولة",
        emptyDescription: "أنشئ موعدًا لإضافة رابط YouTube إلى القائمة عند حلول وقته.",
        url: "رابط YouTube",
        urlPlaceholder: "https://www.youtube.com/watch?v=...",
        date: "التاريخ",
        time: "الوقت",
        repeat: "التكرار",
        create: "إنشاء",
        nextRun: "الموعد التالي",
        triggerCount: "مرات التشغيل",
        lastTriggered: "آخر تشغيل",
        never: "لم يحدث",
        cancel: "إلغاء",
        remove: "حذف",
        repeatOptions: {
          once: "مرة واحدة",
          daily: "يوميًا",
          weekly: "أسبوعيًا"
        },
        status: {
          scheduled: "مجدول",
          triggered: "تم التشغيل",
          completed: "مكتمل",
          failed: "فشل",
          canceled: "ملغي"
        },
        validation: {
          dateRequired: "اختر التاريخ.",
          timeRequired: "اختر الوقت."
        },
        toast: {
          created: "تم إنشاء التنزيل المجدول.",
          scheduled: "سيبدأ التنزيل في الموقت المحدد.",
          triggered: "تمت إضافة التنزيل المجدول إلى القائمة.",
          triggeredDescription: "اضغط على 'الذهاب للقائمة' لعرض التنزيل.",
          goToQueue: "الذهاب للقائمة"
        },
        errors: {
          notFound: "التنزيل المجدول غير موجود."
        }
      },
      settings: {
        title: "الإعدادات",
        subtitle: "يتم حفظ التفضيلات تلقائيًا في هذا النموذج.",
        reset: "إعادة ضبط الإعدادات",
        autoSaved: "يتم حفظ التغييرات تلقائيًا.",
        sections: {
          general: "عام",
          appearance: "المظهر",
          downloads: "التنزيلات",
          notifications: "الإشعارات",
          clipboard: "الحافظة",
          advanced: "متقدم",
          fileNaming: "تسمية الملفات الذكية"
        },
        downloadFolder: "مجلد التنزيل",
        startWithWindows: "البدء مع Windows",
        minimizeToTray: "التصغير إلى شريط النظام",
        theme: "الثيم",
        themeOptions: {
          light: "فاتح",
          dark: "داكن",
          system: "النظام"
        },
        language: "اللغة",
        languageOptions: {
          en: "الإنجليزية",
          ar: "العربية"
        },
        concurrentDownloads: "التنزيلات المتزامنة",
        speedLimit: "حد السرعة",
        defaultQuality: "الجودة الافتراضية",
        defaultVideoFormat: "صيغة الفيديو الافتراضية",
        defaultAudioFormat: "صيغة الصوت الافتراضية",
        enableNotifications: "تفعيل الإشعارات",
        notificationWhenCompleted: "إشعار عند الاكتمال",
        notificationWhenFailed: "إشعار عند الفشل",
        clipboardMonitoring: "مراقبة الحافظة",
        askBeforeDownloading: "السؤال قبل التنزيل",
        ytdlpPath: "مسار yt-dlp",
        ffmpegPath: "مسار FFmpeg",
        proxy: "البروكسي",
        fileNameTemplate: "قالب اسم الملف",
        fileNamePreview: "معاينة مباشرة",
        toast: {
          reset: "تمت إعادة الإعدادات إلى القيم الافتراضية."
        }
      },
      validation: {
        emptyUrl: "أدخل رابط YouTube.",
        invalidUrl: "أدخل رابطًا صحيحًا."
      },
      errors: {
        unsupportedUrl: "الرابط صحيح لكنه غير مدعوم. استخدم رابط YouTube.",
        networkError: "خطأ شبكة تجريبي.",
        videoUnavailable: "الفيديو غير متاح تجريبيًا.",
        diskFull: "القرص ممتلئ تجريبيًا.",
        permissionDenied: "رفض صلاحيات تجريبي.",
        ytdlpError: "خطأ yt-dlp تجريبي.",
        ffmpegError: "خطأ FFmpeg تجريبي.",
        unknown: "حدث خطأ أثناء تحليل الرابط."
      },
      toast: {
        addedToQueue: "تمت الإضافة للقائمة.",
        addedManyToQueue: "تمت إضافة {{count}} عناصر للقائمة."
      },
      common: {
        empty: "لا يوجد شيء هنا بعد.",
        version: "الإصدار"
      },
      about: {
        description: "مدير بأسلوب تطبيق سطح مكتب لتنظيم تنزيلات الفيديو والوسائط.",
        developerTitle: "عن المطور",
        developerDescription: "Remon Gamal مطور برمجيات مهتم بتطوير تطبيقات Frontend وتطبيقات سطح المكتب متعددة الأنظمة، مع التركيز على الواجهات الحديثة والأداء المستقر وتجربة المستخدم المميزة.",
        productTitle: "Remon Download",
        productDescription: "تطبيق مستقل لإدارة وتنظيم تنزيلات الفيديو والصوت، مع دعم اختيار الجودة والصيغة وإدارة Queue والإيقاف والاستئناف وإعادة المحاولة والإلغاء والجدولة والسجل والمفضلة وشريط النظام والإشعارات وحفظ البيانات بشكل دائم.",
        platforms: "الأنظمة المدعومة",
        platformList: "Windows، macOS، Linux",
        copyright: "© 2026 Remon Gamal — جميع الحقوق محفوظة",
        applicationName: "اسم التطبيق",
        details: "تفاصيل التطبيق",
        developer: "المطور",
        contact: "التواصل",
        phone: "الهاتف",
        whatsapp: "واتساب",
        email: "البريد الإلكتروني"
      },
      devTools: {
        title: "أدوات التطوير",
        shortcut: "Ctrl + Shift + D",
        close: "إغلاق أدوات التطوير",
        mockScenario: "سيناريو المحاكاة",
        simulationSpeed: "سرعة المحاكاة",
        seedDemoData: "إضافة بيانات تجريبية",
        clearMockData: "مسح بيانات المحاكاة",
        resetSettings: "إعادة ضبط الإعدادات",
        simulateDownload: "محاكاة تنزيل",
        simulateError: "محاكاة خطأ",
        speedValue: "{{speed}}x",
        scenarios: {
          success: "نجاح",
          network_error: "خطأ شبكة",
          video_unavailable: "الفيديو غير متاح",
          disk_full: "القرص ممتلئ",
          permission_denied: "رفض الصلاحيات",
          ytdlp_error: "خطأ yt-dlp",
          ffmpeg_error: "خطأ FFmpeg"
        },
        toast: {
          seeded: "تمت إضافة بيانات تجريبية للقائمة.",
          cleared: "تم مسح بيانات المحاكاة.",
          settingsReset: "تمت إعادة ضبط الإعدادات.",
          simulatedDownload: "تمت إضافة تنزيل تجريبي.",
          errorSimulated: "تمت محاكاة الخطأ التجريبي."
        }
      }
    }
  }
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;

