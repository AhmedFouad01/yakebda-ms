/**
 * النصوص العربية الأساسية — YKMS-01
 * كل النصوص الظاهرة للمستخدم تمر من هنا. لا نصوص hardcoded داخل الكود.
 */
export const ar = {
  app: {
    name: "YAKEBDA MS — نظام إدارة المطاعم",
    brand_ar: "يا كبدة",
    dir: "rtl",
    locale: "ar",
  },
  errors: {
    unauthorized: "يجب تسجيل الدخول أولًا.",
    forbidden: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
    not_found: "العنصر المطلوب غير موجود.",
    validation: "البيانات المدخلة غير صحيحة. راجع الحقول وحاول مرة أخرى.",
    conflict: "لا يمكن إتمام العملية بسبب تعارض في البيانات.",
    bad_credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    bad_pin: "رمز PIN غير صحيح.",
    server: "حدث خطأ غير متوقع. حاول مرة أخرى.",
    bad_status_transition: "لا يمكن نقل الطلب إلى هذه الحالة من حالته الحالية.",
    product_unavailable: "هذا الصنف غير متاح حاليًا في الفرع",
    no_receipt_printer: "لا توجد طابعة إيصالات نشطة في هذا الفرع.",
    shift_required_for_cash: "لا يمكن قبول دفع نقدي بدون شيفت مفتوح في الفرع.",
    shift_already_open: "يوجد شيفت مفتوح بالفعل في هذا الفرع.",
    payment_method_disabled: "طريقة الدفع هذه غير مفعلة في الإعدادات.",
    order_type_disabled: "نوع الطلب هذا غير مفعل في الإعدادات.",
    delivery_customer_required: "طلب الدليفري يتطلب اختيار عميل.",
    delivery_address_required: "طلب الدليفري يتطلب عنوان توصيل.",
    delivery_min_order: "قيمة الطلب أقل من الحد الأدنى للتوصيل.",
    discount_above_limit: "الخصم يتجاوز حد الكاشير — يتطلب موافقة مدير.",
    discount_reason_required: "سبب الخصم مطلوب.",
    driver_inactive: "هذا السائق غير نشط.",
    order_cancel_disabled: "إلغاء الطلبات غير مفعل في الإعدادات.",
    receipt_printing_disabled: "طباعة الإيصالات غير مفعلة في الإعدادات.",
  },
  messages: {
    login_ok: "تم تسجيل الدخول بنجاح.",
    created: "تم الإنشاء بنجاح.",
    updated: "تم الحفظ بنجاح.",
    deleted: "تم الحذف بنجاح.",
    token_created_once:
      "تم إنشاء الرمز. انسخه الآن — لن يظهر مرة أخرى لأسباب أمنية.",
    shift_opened: "تم فتح الشيفت.",
    shift_closed: "تم إغلاق الشيفت.",
    print_job_queued: "تمت إضافة مهمة الطباعة إلى الطابور.",
  },
} as const;
