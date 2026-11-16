export type SupportedSovereignLanguage = 'en' | 'ur' | 'sd' | 'ar';

export interface SovereignCopy {
    direction: 'ltr' | 'rtl';
    speechLanguage: string;
    languageName: string;
    shieldTitle: string;
    shieldDescription: string;
    localControlNote: string;
    controlPinLabel: string;
    freezeControls: string;
    restoreControls: string;
    frozenStatus: string;
    activeStatus: string;
    scamScannerTitle: string;
    scamScannerPlaceholder: string;
    runScamScanner: string;
    scamBlockedAlert: string;
    scanCompleted: string;
    truthFilterTitle: string;
    truthFilterPlaceholder: string;
    runTruthFilter: string;
    localFingerprint: string;
    offlineAppShellNote: string;
}

export const SOVEREIGN_COPY: Readonly<Record<SupportedSovereignLanguage, SovereignCopy>> = {
    en: {
        direction: 'ltr',
        speechLanguage: 'en-US',
        languageName: 'English',
        shieldTitle: 'Safety tools',
        shieldDescription: 'Text-based scam signals and invoice checks. Results are heuristic, not identity verification.',
        localControlNote: 'Local controls only; external payment providers are not frozen by this switch.',
        controlPinLabel: 'Control PIN',
        freezeControls: 'Freeze internal operations',
        restoreControls: 'Restore internal operations',
        frozenStatus: 'INTERNAL OPERATIONS FROZEN',
        activeStatus: 'INTERNAL CONTROLS ACTIVE',
        scamScannerTitle: 'Scam-text signal check',
        scamScannerPlaceholder: 'Paste a suspicious SMS or caller transcript…',
        runScamScanner: 'Check text for scam signals',
        scamBlockedAlert: 'Potential scam signals found. Verify independently before acting.',
        scanCompleted: 'Text scan completed; this is not identity verification.',
        truthFilterTitle: 'Text and invoice check',
        truthFilterPlaceholder: 'Paste contract text, a message, or invoice…',
        runTruthFilter: 'Check text and invoice math',
        localFingerprint: 'Local SHA-256 fingerprint',
        offlineAppShellNote: 'The app shell may be cached; server-backed features still require a connection.',
    },
    ur: {
        direction: 'rtl',
        speechLanguage: 'ur-PK',
        languageName: 'اردو',
        shieldTitle: 'حفاظتی ٹولز',
        shieldDescription: 'متن میں فراڈ کے اشارے اور رسید کے حساب کی جانچ۔ یہ شناخت کی تصدیق نہیں۔',
        localControlNote: 'یہ سوئچ صرف مقامی آپریشنز کو روکتا ہے؛ بیرونی ادائیگی سروسز منجمد نہیں ہوتیں۔',
        controlPinLabel: 'کنٹرول پن',
        freezeControls: 'مقامی آپریشنز روکیں',
        restoreControls: 'مقامی آپریشنز بحال کریں',
        frozenStatus: 'مقامی آپریشنز رکے ہوئے ہیں',
        activeStatus: 'مقامی کنٹرول فعال ہیں',
        scamScannerTitle: 'فراڈ والے متن کی جانچ',
        scamScannerPlaceholder: 'مشکوک ایس ایم ایس یا کال کا متن پیسٹ کریں…',
        runScamScanner: 'متن میں فراڈ کے اشارے دیکھیں',
        scamBlockedAlert: 'ممکنہ فراڈ کے اشارے ملے ہیں۔ کوئی قدم اٹھانے سے پہلے آزادانہ تصدیق کریں۔',
        scanCompleted: 'متن کی جانچ مکمل ہوئی؛ یہ شناخت کی تصدیق نہیں۔',
        truthFilterTitle: 'متن اور رسید کی جانچ',
        truthFilterPlaceholder: 'معاہدہ، پیغام یا رسید کا متن پیسٹ کریں…',
        runTruthFilter: 'متن اور رسید کا حساب جانچیں',
        localFingerprint: 'مقامی SHA-256 فنگرپرنٹ',
        offlineAppShellNote: 'ایپ کا خول محفوظ ہو سکتا ہے؛ سرور والے کام کے لیے انٹرنیٹ درکار ہے۔',
    },
    sd: {
        direction: 'rtl',
        speechLanguage: 'sd-PK',
        languageName: 'سنڌي',
        shieldTitle: 'حفاظتي اوزار',
        shieldDescription: 'لکيل متن ۾ دوکي جا اشارا ۽ بل جو حساب جاچيو. هي سڃاڻپ جي تصديق ناهي.',
        localControlNote: 'هي سوئچ رڳو مقامي عمل روڪي ٿو؛ ٻاهريون ادائيگي جا نيٽ ورڪ بند نٿا ٿين.',
        controlPinLabel: 'ڪنٽرول پن',
        freezeControls: 'مقامي عمل روڪيو',
        restoreControls: 'مقامي عمل بحال ڪريو',
        frozenStatus: 'مقامي عمل روڪيل آهن',
        activeStatus: 'مقامي ڪنٽرول فعال آهن',
        scamScannerTitle: 'دوکي واري متن جي جاچ',
        scamScannerPlaceholder: 'شڪي ايس ايم ايس يا ڪال جو متن پيسٽ ڪريو…',
        runScamScanner: 'متن ۾ دوکي جا اشارا ڏسو',
        scamBlockedAlert: 'دوکي جا امڪاني اشارا مليا. عمل ڪرڻ کان اڳ الڳ تصديق ڪريو.',
        scanCompleted: 'متن جي جاچ مڪمل؛ هي سڃاڻپ جي تصديق ناهي.',
        truthFilterTitle: 'متن ۽ بل جي جاچ',
        truthFilterPlaceholder: 'معاهدي، پيغام يا بل جو متن پيسٽ ڪريو…',
        runTruthFilter: 'متن ۽ بل جو حساب جاچيو',
        localFingerprint: 'مقامي SHA-256 فنگرپرنٽ',
        offlineAppShellNote: 'ايپ جو خول محفوظ ٿي سگهي ٿو؛ سرور واري ڪم لاءِ نيٽ گهربل آهي.',
    },
    ar: {
        direction: 'rtl',
        speechLanguage: 'ar-SA',
        languageName: 'العربية',
        shieldTitle: 'أدوات الحماية',
        shieldDescription: 'فحص مؤشرات الاحتيال في النصوص وحساب الفواتير. لا يثبت هوية المستخدم.',
        localControlNote: 'يوقف هذا المفتاح العمليات المحلية فقط، ولا يجمّد مزودي الدفع الخارجيين.',
        controlPinLabel: 'رمز التحكم',
        freezeControls: 'إيقاف العمليات الداخلية',
        restoreControls: 'استعادة العمليات الداخلية',
        frozenStatus: 'العمليات الداخلية متوقفة',
        activeStatus: 'عناصر التحكم الداخلية نشطة',
        scamScannerTitle: 'فحص مؤشرات الاحتيال النصية',
        scamScannerPlaceholder: 'الصق رسالة مشبوهة أو نص مكالمة…',
        runScamScanner: 'فحص النص بحثاً عن مؤشرات الاحتيال',
        scamBlockedAlert: 'عُثر على مؤشرات احتيال محتملة. تحقّق بشكل مستقل قبل التصرف.',
        scanCompleted: 'اكتمل فحص النص؛ هذا لا يثبت الهوية.',
        truthFilterTitle: 'فحص النص والفاتورة',
        truthFilterPlaceholder: 'الصق نص عقد أو رسالة أو فاتورة…',
        runTruthFilter: 'فحص النص وحساب الفاتورة',
        localFingerprint: 'بصمة SHA-256 محلية',
        offlineAppShellNote: 'قد تُحفظ واجهة التطبيق؛ الميزات التي تعتمد على الخادم تحتاج اتصالاً.',
    },
};

export function getSovereignCopy(language: SupportedSovereignLanguage): SovereignCopy {
    return SOVEREIGN_COPY[language];
}
