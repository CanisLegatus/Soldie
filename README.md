# Менеджер уценки Галамарт — Android

`galamart-analyst/` — исходное офлайн-веб-приложение. Папка `android/` — полноценный Android-проект, который упаковывает его в APK и открывает через защищённый внутренний HTTPS-origin WebView, а не через ненадёжный `file://`.

## Сборка APK

Требования: Android SDK Platform 35, Android Build Tools и JDK 17.

```bash
gradle :app:assembleDebug
```

Готовый APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Что поддерживает APK

- выбор `.xlsx`, `.xls`, `.csv` и JSON через системный Android file picker;
- все исходные разделы: дашборд, анализ, ТОП-100, проблемы, уценка, просмотр, зоны и подарки;
- экспорт Excel и сохранение зон через системный Android save dialog;
- локальное хранение настроек и зон внутри приложения;
- полностью офлайн-работа: сеть и доступ WebView к произвольным файлам выключены.

После изменений в `galamart-analyst/` синхронизируйте ассеты перед сборкой:

```bash
rsync -a --delete galamart-analyst/ android/app/src/main/assets/www/
```
