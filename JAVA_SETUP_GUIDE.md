# 📋 تغيير Java SDK إلى JDK 17

## ✅ التغييرات المجراة

تم تحديث المشروع للعمل مع **JDK 17** بسهولة وبدون مشاكل:

| الملف | التغيير |
|------|--------|
| `gradle.properties` | أضفنا `org.gradle.java.home=C:\\Program Files\\Java\\jdk-17` |
| `local.properties` | أضفنا `java.home=C:\\Program Files\\Java\\jdk-17` |
| `build.bat` | حدثنا `JAVA_HOME` إلى jdk-17 |

---

## 🔧 الخطوات

### الخطوة 1: تحقق من وجود JDK 17

```bash
# افتح CMD واختبر:
C:\Program Files\Java\jdk-17\bin\java -version
```

يجب أن ترى:
```
java version "17"
```

---

### الخطوة 2: تحديث متغيرات البيئة (اختياري)

إذا لم تعمل الطريقة الأولى، اضبط متغيرات البيئة يدويًا:

**في Windows:**
1. اضغط `Windows + X` اختر `System`
2. اذهب إلى `Advanced System Settings`
3. اضغط `Environment Variables`
4. اضغط `New` تحت `System variables`
5. أضف:
   - **Name**: `JAVA_HOME`
   - **Value**: `C:\Program Files\Java\jdk-17`

ثم اضغط **OK** و **OK** و **OK**

---

### الخطوة 3: البناء بسهولة

**الطريقة السهلة:**
```bash
# انقر على الملف مباشرة:
c:\Users\DZ\Desktop\viddown\build.bat
```

**أو من CMD:**
```bash
cd c:\Users\DZ\Desktop\viddown\android

# بدون تنظيف:
gradlew.bat build --stacktrace

# أو تنظيف كامل:
gradlew.bat clean build --stacktrace
```

---

## 📊 المتطلبات

| المتطلب | القيمة |
|--------|--------|
| JDK | 17 |
| Gradle | 8.2.1 |
| Android SDK | API 34 |
| Kotlin | 1.9.0 |

---

## ✨ الميزات

✅ تجميع أسرع من JDK 17 مقارنة بالإصدارات الأقدم
✅ متوافق مع Gradle 8.2.1
✅ آمن وموثوق
✅ يدعم Android 7.0 إلى 14
✅ بدون تحذيرات

---

## 🐛 استكشاف الأخطاء

### الخطأ: "Invalid Java Version"

**الحل:**
```bash
# تحقق من المسار:
dir "C:\Program Files\Java"

# إذا كان المسار مختلفاً، حدث الملفات:
# 1. gradle.properties
# 2. local.properties
# 3. build.bat
```

---

### الخطأ: "Could not create parent directory"

**الحل:**
```bash
# حذف مجلدات Gradle القديمة:
rmdir /s /q .gradle
rmdir /s /q %USERPROFILE%\.gradle
```

---

### الخطأ: "JAVA_HOME is not set"

**الحل:**
```bash
# في CMD:
setx JAVA_HOME "C:\Program Files\Java\jdk-17"

# أغلق CMD والفتح مرة أخرى
```

---

## 🚀 الخطوة التالية

```bash
cd c:\Users\DZ\Desktop\viddown\android
gradlew.bat clean build --stacktrace
```

---

**✅ جاهز للعمل!** 🎉